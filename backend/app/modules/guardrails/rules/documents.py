"""Layer 3: Document & file upload security.

Enforces:
  - Strict extension allowlist (.jpg, .jpeg, .png, .webp, .pdf)
  - Real magic-byte signature verification (rejects spoofed extensions / MIME types)
  - File size ceiling (rejects empty or oversized files)
  - Server-generated UUID filenames (never trusts user filenames or paths)
  - Private storage strictly outside the public web root
  - SHA-256 hashing & malware scanner hook (PENDING_SCAN when AV unavailable)
"""
from __future__ import annotations

import hashlib
import os
import uuid
from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException, status

from app.modules.guardrails.providers.malware_scanner import MalwareScanner

ALLOWED_EXTENSIONS: dict[str, set[str]] = {
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".png": {"image/png"},
    ".webp": {"image/webp"},
    ".pdf": {"application/pdf"},
}


@dataclass(frozen=True)
class ValidatedUpload:
    detected_mime_type: str
    canonical_ext: str
    file_size_bytes: int
    sha256_hash: str
    storage_key: str
    absolute_path: Path
    scanner_engine: str
    scan_status: str
    scan_details: str


def detect_magic_mime(payload: bytes) -> str | None:
    """Inspect real leading file bytes rather than trusting extension or Content-Type."""
    if len(payload) < 8:
        return None
    if payload.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if payload.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if payload[:4] == b"RIFF" and len(payload) >= 12 and payload[8:12] == b"WEBP":
        return "image/webp"
    if payload.startswith(b"%PDF-"):
        return "application/pdf"
    return None


def validate_and_store_private_document(
    *,
    original_filename: str,
    payload: bytes,
    owner_scope: str,
    uploader_user_id: str,
    storage_root: Path,
    max_size_bytes: int,
    malware_scanner: MalwareScanner,
) -> ValidatedUpload:
    clean_name = os.path.basename(original_filename or "").strip()
    if not clean_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded filename is missing.",
        )

    ext = Path(clean_name).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File extension '{ext}' is not allowed. Permitted: {', '.join(sorted(ALLOWED_EXTENSIONS))}.",
        )

    size = len(payload)
    if size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )
    if size > max_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of {max_size_bytes} bytes.",
        )

    detected_mime = detect_magic_mime(payload)
    if detected_mime is None or detected_mime not in ALLOWED_EXTENSIONS[ext]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "File content signature does not match its extension (possible spoofed file). "
                f"Extension='{ext}', detected='{detected_mime or 'unknown'}'."
            ),
        )

    # Extra defense for PDFs: block embedded JavaScript / launch actions in seller docs
    if detected_mime == "application/pdf" and (
        b"/JavaScript" in payload or b"/JS " in payload or b"/Launch" in payload
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PDF contains disallowed embedded script/launch actions.",
        )

    scan = malware_scanner.scan_bytes(payload)
    if scan.scan_status == "INFECTED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Upload blocked by malware check: {scan.details}",
        )

    sha256_hash = hashlib.sha256(payload).hexdigest()
    safe_scope = "".join(c for c in owner_scope.lower() if c.isalnum() or c in ("_", "-")) or "general"
    server_filename = f"{uuid.uuid4().hex}{ext}"
    storage_key = f"{safe_scope}/{uploader_user_id}/{server_filename}"

    resolved_root = storage_root.resolve()
    target_path = (resolved_root / storage_key).resolve()
    if resolved_root not in target_path.parents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Resolved storage path escaped private storage root.",
        )

    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_bytes(payload)

    return ValidatedUpload(
        detected_mime_type=detected_mime,
        canonical_ext=ext,
        file_size_bytes=size,
        sha256_hash=sha256_hash,
        storage_key=storage_key,
        absolute_path=target_path,
        scanner_engine=scan.scanner_engine,
        scan_status=scan.scan_status,
        scan_details=scan.details,
    )
