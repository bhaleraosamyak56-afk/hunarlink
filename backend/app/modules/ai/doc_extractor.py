"""Deterministic PDF & Image Text Extractor for Artisan GI / ID Card Pre-Screening.

Extracts text locally with ZERO GPU VRAM:
  - PDFs: `pypdf` embedded text extraction
  - Images (JPG/PNG): optional `rapidocr_onnxruntime` if installed, else filename + header metadata
  - Regex extraction of GI registration patterns, J&K districts, and craft keywords
"""
from __future__ import annotations

import pathlib
import re
from typing import Any

from pypdf import PdfReader

_JK_DISTRICTS = (
    "Srinagar",
    "Budgam",
    "Anantnag",
    "Baramulla",
    "Pulwama",
    "Pampore",
    "Ganderbal",
    "Bandipora",
    "Kupwara",
    "Shopian",
    "Kulgam",
    "Jammu",
    "Kishtwar",
    "Doda",
    "Kathua",
    "Udhampur",
    "Reasi",
    "Rajouri",
    "Poonch",
    "Samba",
    "Leh",
    "Kargil",
)

_CRAFT_KEYWORDS = (
    "pashmina",
    "kani",
    "sozni",
    "walnut",
    "carpet",
    "kaleen",
    "papier",
    "copper",
    "saffron",
    "kesar",
    "khatamband",
    "crewel",
    "chain stitch",
    "namda",
    "willow",
    "shawl",
)

_GI_PATTERN = re.compile(
    r"\b(?:GI[-/\s]?(?:JK|IN|REG)?[-/\s]?[A-Z0-9]{2,12}(?:[-/\s]?[A-Z0-9]{2,10})?|AU[-/\s]?\d{3,10})\b",
    re.IGNORECASE,
)


def extract_document_signals(
    *,
    file_path: pathlib.Path | None,
    detected_mime_type: str,
    original_filename: str,
    declared_text_hint: str | None = None,
) -> dict[str, Any]:
    """Extract raw text and deterministic GI/district/craft tokens from an uploaded document."""
    extracted_text = ""
    extraction_method = "metadata_only"
    extraction_notes: list[str] = []

    if file_path is not None and file_path.exists():
        if "pdf" in (detected_mime_type or "").lower() or file_path.suffix.lower() == ".pdf":
            try:
                reader = PdfReader(str(file_path))
                pages_text = []
                for idx, page in enumerate(reader.pages[:5]):
                    txt = (page.extract_text() or "").strip()
                    if txt:
                        pages_text.append(txt)
                extracted_text = "\n".join(pages_text).strip()
                extraction_method = "pypdf_text"
                if not extracted_text:
                    extraction_notes.append(
                        "PDF contains no selectable embedded text (likely a scanned image PDF); human visual check required."
                    )
            except Exception as exc:
                extraction_notes.append(f"PDF text extraction encountered an issue ({type(exc).__name__}).")
        elif (detected_mime_type or "").lower().startswith("image/"):
            # Optional CPU OCR if `rapidocr_onnxruntime` is installed on the host
            try:
                from rapidocr_onnxruntime import RapidOCR  # type: ignore

                ocr = RapidOCR()
                result, _ = ocr(str(file_path))
                if result:
                    extracted_text = "\n".join(str(line[1]) for line in result if len(line) >= 2).strip()
                    extraction_method = "rapidocr_cpu"
                else:
                    extraction_method = "rapidocr_empty"
                    extraction_notes.append("Image OCR found no readable text; verify photo sharpness.")
            except ImportError:
                extraction_method = "image_metadata_only"
                extraction_notes.append(
                    "Image file integrity (magic bytes + SHA-256) verified; visual OCR engine is optional, so Admin visual inspection is required."
                )
            except Exception as exc:
                extraction_method = "image_ocr_fallback"
                extraction_notes.append(f"Image OCR fallback ({type(exc).__name__}); Admin visual check required.")

    combined_corpus = "\n".join(
        part for part in (extracted_text, original_filename, declared_text_hint or "") if part
    )
    gi_candidates = sorted({m.group(0).upper().strip() for m in _GI_PATTERN.finditer(combined_corpus)})
    districts_found = [
        d for d in _JK_DISTRICTS if re.search(rf"\b{re.escape(d)}\b", combined_corpus, re.IGNORECASE)
    ]
    crafts_found = [kw for kw in _CRAFT_KEYWORDS if kw in combined_corpus.lower()]

    return {
        "extraction_method": extraction_method,
        "text_char_count": len(extracted_text),
        "extracted_text_preview": extracted_text[:1200],
        "detected_gi_codes": gi_candidates[:8],
        "detected_districts": districts_found[:6],
        "detected_craft_keywords": crafts_found[:8],
        "notes": extraction_notes,
    }
