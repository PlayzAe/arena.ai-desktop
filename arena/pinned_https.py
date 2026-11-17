"""Pinned-transport HTTPS GETs (SSRF hardening), shared by the web backend and
the self-updater.

Several code paths download files from URLs that arrive in model output, user
input or release metadata. Every such fetch must be validated first: the
helpers here reject non-https schemes and any hostname that resolves to a
private, loopback, link-local, reserved, multicast, unspecified or CGNAT
address (IPv4 and IPv6, including IPv4-mapped).

pinned_https_open goes further: it resolves once, validates every returned
address, then connects to that exact address while verifying TLS against the
original hostname. One resolve for both steps - a DNS rebinding flip between
check and connect cannot redirect the socket. Redirects are followed only with
the same re-validation and re-pinning on every hop.
"""
from __future__ import annotations

import http.client
import urllib.parse
from typing import Iterator, Optional, Tuple

_CGNAT_V4 = None  # built lazily (ip_network), see ip_blocked


def ip_blocked(addr: str) -> bool:
    """True when an address must never be fetched (private/internal ranges)."""
    import ipaddress as _ipmod
    global _CGNAT_V4
    try:
        ip = _ipmod.ip_address(str(addr).split("%")[0])  # strip IPv6 zone id
    except ValueError:
        return True
    mapped = getattr(ip, "ipv4_mapped", None)
    if mapped is not None:  # ::ffff:127.0.0.1 and friends behave like IPv4
        ip = mapped
    if _CGNAT_V4 is None:
        _CGNAT_V4 = _ipmod.ip_network("100.64.0.0/10")
    if ip.version == 4 and ip in _CGNAT_V4:
        return True
    return bool(ip.is_private or ip.is_loopback or ip.is_reserved
                or ip.is_link_local or ip.is_multicast or ip.is_unspecified)


def resolve_public_ip(host: str) -> str:
    """Resolve `host`, vet every address, and return the first (public) one.
    Callers must connect only to the returned address (see PinnedHTTPSConnection).
    Raises ValueError for unresolvable or blocked hosts."""
    import socket as _sock
    try:
        infos = _sock.getaddrinfo(host, None, type=_sock.SOCK_STREAM)
    except _sock.gaierror:
        raise ValueError("Cannot resolve hostname.")
    first = None
    for info in infos:
        addr = info[4][0]
        if ip_blocked(addr):
            raise ValueError("Private/internal addresses not allowed.")
        if first is None:
            first = addr
    if first is None:
        raise ValueError("Cannot resolve hostname.")
    return first


def url_is_public(url: str, allow_http: bool = False) -> Optional[str]:
    """None when the URL is safe to fetch; otherwise a human-readable reason."""
    u = urllib.parse.urlparse(url)
    schemes = ("https", "http") if allow_http else ("https",)
    if u.scheme not in schemes:
        return "Only https links can be fetched."
    host = (u.hostname or "").lower()
    if not host or host == "localhost" or host.endswith(".localhost"):
        return "Local addresses are not allowed."
    try:
        resolve_public_ip(host)
    except ValueError as e:
        return str(e)
    return None


class PinnedHTTPSConnection(http.client.HTTPSConnection):
    """HTTPS connection that connects to one pre-validated IP address but
    verifies the TLS certificate against the real hostname."""

    def __init__(self, host: str, ip: str, timeout: float = 60):
        super().__init__(host, timeout=timeout)
        self._pinned_ip = ip

    def connect(self):
        import socket as _sock
        sock = _sock.create_connection((self._pinned_ip, self.port), self.timeout)
        self.sock = self._context.wrap_socket(sock, server_hostname=self.host)


class PinnedStream:
    """A started response over a pinned connection. `content_length` is 0 when
    the body is transfer/content-encoded (the header counts compressed bytes
    while iter_chunks yields the decoded ones)."""

    def __init__(self, resp, conn):
        self._resp = resp
        self._conn = conn
        self.status = resp.status
        self.content_type = (resp.getheader("Content-Type") or "").split(";")[0].strip()
        enc = (resp.getheader("Content-Encoding") or "").strip().lower()
        raw = (resp.getheader("Content-Length") or "").strip()
        self.content_length = int(raw) if raw.isdigit() and (not enc or enc == "identity") else 0

    def iter_chunks(self, size: int = 1 << 16) -> Iterator[bytes]:
        while True:
            chunk = self._resp.read(size)
            if not chunk:
                break
            yield chunk

    def close(self) -> None:
        self._conn.close()


def pinned_https_open(url: str, timeout: float = 60, max_redirects: int = 3) -> PinnedStream:
    """Resolve once, vet, and connect to the exact address; follow up to
    `max_redirects` hops, re-validating and re-pinning every hop. Refused URLs
    raise ValueError; connection/HTTP-level failures raise OSError."""
    current = url
    for _hop in range(max_redirects + 1):
        u = urllib.parse.urlparse(current)
        if u.scheme != "https":
            raise ValueError("Only https links can be fetched.")
        host = (u.hostname or "").lower()
        if not host or host == "localhost" or host.endswith(".localhost"):
            raise ValueError("Local addresses are not allowed.")
        # One resolve for both the vetting and the connect: a DNS flip
        # right after this line cannot redirect the socket elsewhere.
        pinned_ip = resolve_public_ip(host)
        conn = PinnedHTTPSConnection(u.hostname, pinned_ip, timeout=timeout)
        try:
            path = urllib.parse.urlunparse(("", "", u.path or "/", u.params, u.query, ""))
            conn.request("GET", path, headers={
                "Host": u.hostname,
                "User-Agent": "Arena-Desktop-Media/1.0",
                "Accept": "*/*",
            })
            resp = conn.getresponse()
            if resp.status in (301, 302, 303, 307, 308):
                loc = resp.getheader("Location") or ""
                if not loc:
                    raise OSError(f"HTTP {resp.status}: redirect without Location")
                current = urllib.parse.urljoin(current, loc)
                continue
            return PinnedStream(resp, conn)
        except BaseException:
            conn.close()
            raise
    raise OSError("Too many redirects.")


def pinned_https_request(url: str, timeout: float = 60, max_bytes: int = 300 * 1024 * 1024,
                         max_redirects: int = 3) -> Tuple[int, bytes, str]:
    """Buffered fetch: (status, blob, content_type). Status >= 400 returns its
    code with an empty body instead of raising, so callers can implement their
    own retry semantics; refused URLs raise ValueError and larger-than-`max_bytes`
    bodies raise ValueError."""
    stream = pinned_https_open(url, timeout=timeout, max_redirects=max_redirects)
    try:
        if stream.status >= 400:
            return stream.status, b"", stream.content_type
        blob = b""
        for chunk in stream.iter_chunks():
            blob += chunk
            if len(blob) > max_bytes:
                raise ValueError(f"File is larger than {max_bytes // (1024 * 1024)} MB.")
        return stream.status, blob, stream.content_type
    finally:
        stream.close()


def pinned_https_get(url: str, timeout: float = 60, max_bytes: int = 300 * 1024 * 1024,
                     max_redirects: int = 3) -> Tuple[bytes, str]:
    """Stream a public https URL into memory with a size cap. Returns
    (blob, content_type). Raises ValueError for refused URLs and OSError for
    HTTP errors - the classic `(blob, mime)` contract used by connectors."""
    status, blob, ctype = pinned_https_request(url, timeout=timeout, max_bytes=max_bytes,
                                               max_redirects=max_redirects)
    if status >= 400:
        raise OSError(f"HTTP {status}")
    return blob, ctype
