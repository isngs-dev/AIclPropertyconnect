from datetime import date


def inr(paise: int) -> str:
    """Nigerian Naira from integer kobo: 125000000 -> ₦1,250,000.00 (name kept for compatibility)."""
    neg = paise < 0
    naira, kobo = divmod(abs(int(paise)), 100)
    return f"{'-' if neg else ''}₦{naira:,}.{kobo:02d}"


def financial_year(d: date) -> str:
    start = d.year if d.month >= 4 else d.year - 1
    return f"{start}-{str(start + 1)[2:]}"


def fy_bounds(fy: str) -> tuple[date, date]:
    start = int(fy[:4])
    return date(start, 4, 1), date(start + 1, 3, 31)
