# app/core/qr.py
#
# Server-side QR rendering for TOTP provisioning URIs.
# Intentionally WITHOUT an external service (previously: chart.googleapis.com) – the
# TOTP secret must not leave the self-hosted trust boundary. Plain SVG built from the
# QR matrix, no Pillow/lxml required.

import base64

import qrcode


def totp_qr_data_uri(otpauth_uri: str) -> str:
    """Render an otpauth:// URI as SVG and return it as a data: URI.

    The result can be used directly as `<img src=...>` and triggers no external
    request at all – the QR code (and thus the TOTP secret) stays on the server.
    """
    qr = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        border=2,
    )
    qr.add_data(otpauth_uri)
    qr.make(fit=True)
    matrix = qr.get_matrix()
    size = len(matrix)

    rects = []
    for y, row in enumerate(matrix):
        for x, cell in enumerate(row):
            if cell:
                rects.append(f'<rect x="{x}" y="{y}" width="1" height="1"/>')

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" '
        f'shape-rendering="crispEdges">'
        f'<rect width="{size}" height="{size}" fill="#ffffff"/>'
        f'<g fill="#000000">{"".join(rects)}</g>'
        f'</svg>'
    )
    b64 = base64.b64encode(svg.encode('utf-8')).decode('ascii')
    return f'data:image/svg+xml;base64,{b64}'
