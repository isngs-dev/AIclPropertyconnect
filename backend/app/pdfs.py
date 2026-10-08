"""PDF helpers (receipts + report exports) built on reportlab."""
import io
from datetime import timedelta
import os

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .money import inr

VIOLET, GREEN, ORANGE = colors.HexColor("#22236B"), colors.HexColor("#059669"), colors.HexColor("#EC4899")  # navy, green, pink

FONT, FONT_BOLD, HAS_RUPEE = "Helvetica", "Helvetica-Bold", False
for reg, bold in [
    ("C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/segoeuib.ttf"),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
]:
    if os.path.exists(reg) and os.path.exists(bold):
        pdfmetrics.registerFont(TTFont("AICL", reg))
        pdfmetrics.registerFont(TTFont("AICL-Bold", bold))
        FONT, FONT_BOLD, HAS_RUPEE = "AICL", "AICL-Bold", True
        break


def money(paise: int) -> str:
    s = inr(paise)
    return s if HAS_RUPEE else s.replace("\u20b9", "Rs. ")


def _logo_row():
    from pathlib import Path
    from reportlab.platypus import Image
    p = Path(__file__).parent / "logo.png"
    return Image(str(p), width=22 * mm, height=22 * mm, hAlign="LEFT") if p.exists() else Spacer(1, 1)


def receipt_pdf(*, receipt_no: str, reference_no: str, paid_at, owner_name: str, owner_email: str,
                shop_label: str, market: str, lines: list[tuple[str, str, int]], total_paise: int,
                provider: str, provider_payment_id: str | None) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm)
    ss = getSampleStyleSheet()
    h = ParagraphStyle("h", parent=ss["Title"], fontName=FONT_BOLD, textColor=VIOLET, fontSize=17, alignment=0)
    p = ParagraphStyle("p", parent=ss["Normal"], fontName=FONT, fontSize=10, leading=14)
    small = ParagraphStyle("s", parent=p, fontSize=8, textColor=colors.grey)
    story = [_logo_row(), Paragraph("Abuja Investments Company Limited", h), Paragraph("Payment Receipt", ParagraphStyle("t", parent=p, fontName=FONT_BOLD, fontSize=13)),
             Spacer(1, 6 * mm)]
    meta = [
        ["Receipt No.", receipt_no, "Date & time", ((paid_at + timedelta(hours=1)).strftime("%d %b %Y, %I:%M %p") + " WAT") if paid_at else "-"],
        ["Transaction ref.", reference_no, "Gateway", f"{provider} {provider_payment_id or ''}".strip()],
        ["Received from", owner_name, "Email", owner_email],
        ["Shop", shop_label, "Market", market],
    ]
    t = Table(meta, colWidths=[30 * mm, 55 * mm, 28 * mm, 55 * mm])
    t.setStyle(TableStyle([("FONTNAME", (0, 0), (-1, -1), FONT), ("FONTSIZE", (0, 0), (-1, -1), 9),
                           ("TEXTCOLOR", (0, 0), (0, -1), colors.grey), ("TEXTCOLOR", (2, 0), (2, -1), colors.grey),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    story += [t, Spacer(1, 8 * mm)]
    rows = [["Charge", "Period / basis", "Amount"]] + [[a, b, money(c)] for a, b, c in lines] + [["", "Total paid", money(total_paise)]]
    lt = Table(rows, colWidths=[55 * mm, 78 * mm, 35 * mm])
    lt.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), FONT), ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
        ("BACKGROUND", (0, 0), (-1, 0), VIOLET), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (2, 0), (2, -1), "RIGHT"), ("FONTNAME", (1, -1), (2, -1), FONT_BOLD),
        ("TEXTCOLOR", (2, -1), (2, -1), GREEN), ("LINEABOVE", (0, -1), (-1, -1), 0.8, VIOLET),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story += [lt, Spacer(1, 10 * mm),
              Paragraph("PAID", ParagraphStyle("paid", parent=p, fontName=FONT_BOLD, fontSize=16, textColor=GREEN)),
              Spacer(1, 6 * mm),
              Paragraph("This is a system-generated receipt and does not require a signature.", small)]
    doc.build(story)
    return buf.getvalue()


def table_pdf(title: str, subtitle: str, headers: list[str], rows: list[list], widths: list[float] | None = None) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=12 * mm, rightMargin=12 * mm, topMargin=12 * mm, bottomMargin=12 * mm)
    ss = getSampleStyleSheet()
    h = ParagraphStyle("h", parent=ss["Title"], fontName=FONT_BOLD, textColor=VIOLET, fontSize=16, alignment=0)
    p = ParagraphStyle("p", parent=ss["Normal"], fontName=FONT, fontSize=8, textColor=colors.grey)
    cell = ParagraphStyle("c", parent=ss["Normal"], fontName=FONT, fontSize=7.5, leading=9)
    data = [headers] + [[Paragraph(str(c if c is not None else ""), cell) for c in r] for r in rows]
    t = Table(data, repeatRows=1, colWidths=widths)
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD), ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("BACKGROUND", (0, 0), (-1, 0), VIOLET), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F4F7FD")]),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#D8D4E8")), ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    doc.build([Paragraph(f"Abuja Investments Company Limited - {title}", h), Paragraph(subtitle, p), Spacer(1, 4 * mm), t])
    return buf.getvalue()
