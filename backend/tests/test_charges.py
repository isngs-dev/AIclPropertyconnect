from datetime import date

from sqlalchemy import select

from app import charges as ch
from app.db import SessionLocal
from app.models import ChargeType, Shop
from app.money import inr


def test_service_charge_formula_is_area_times_rate_in_integer_paise():
    # 220 sq ft x Rs 14/sq ft = Rs 3,080.00
    assert ch.calc_amount("PER_SQFT", 220, 1400) == 308000
    # fractional area rounds to the nearest paisa with integer maths: 12.5 sq ft x Rs 33.33
    assert ch.calc_amount("PER_SQFT", 12.5, 3333) == 41663
    assert ch.calc_amount("FIXED", 999, 5200000) == 5200000


def test_naira_formatting():
    assert inr(125000000) == "₦1,250,000.00"
    assert inr(12345678900) == "₦123,456,789.00"
    assert inr(99900) == "₦999.00"


def test_rates_are_versioned_by_effective_date_and_scope():
    with SessionLocal() as db:
        sc = db.scalar(select(ChargeType).where(ChargeType.code == "SERVICE_CHARGE"))
        shop = db.scalar(select(Shop).where(Shop.shop_number == "A-101"))
        restaurant = db.scalar(select(Shop).where(Shop.shop_number == "R-12"))
        cur_start = ch.get_config  # noqa: F841  (config import sanity)
        today = date.today()
        fy_start = today.year if today.month >= 4 else today.year - 1
        old_period, new_period = date(fy_start - 1, 5, 1), date(fy_start, 5, 1)
        assert ch.resolve_rate(db, sc, shop, old_period).amount_paise == 18000
        assert ch.resolve_rate(db, sc, shop, new_period).amount_paise == 21000  # new rate: future periods only
        assert ch.resolve_rate(db, sc, restaurant, new_period).amount_paise == 27000  # shop-type override wins
        assert ch.resolve_rate(db, sc, restaurant, old_period).amount_paise == 18000


def test_generation_is_idempotent():
    with SessionLocal() as db:
        first = ch.generate_charges(db, "SERVICE_CHARGE", date(2040, 1, 1), date(2040, 1, 31), include_new=True)
        second = ch.generate_charges(db, "SERVICE_CHARGE", date(2040, 1, 1), date(2040, 1, 31), include_new=True)
        db.rollback()
    assert first["created"] > 0 and second["created"] == 0


def test_rate_stops_applying_after_effective_to():
    from app.models import ChargeRate
    with SessionLocal() as db:
        gr = db.scalar(select(ChargeType).where(ChargeType.code == "GROUND_RENT"))
        shop = db.scalar(select(Shop).where(Shop.shop_number == "A-101"))
        db.add(ChargeRate(charge_type_id=gr.id, amount_paise=99900000, effective_from=date(2040, 4, 1), effective_to=date(2041, 3, 31), scope_type="SHOP", scope_ref=shop.id))
        db.flush()
        assert ch.resolve_rate(db, gr, shop, date(2040, 6, 1)).amount_paise == 99900000  # inside the window: shop rate wins
        assert ch.resolve_rate(db, gr, shop, date(2041, 3, 31)).amount_paise == 99900000  # end date is inclusive
        assert ch.resolve_rate(db, gr, shop, date(2041, 4, 1)).amount_paise != 99900000  # expired: falls back to the general rate
        db.rollback()


def test_effective_to_validation_via_api(client, admin_h):
    bad = client.post("/api/admin/rates", json={"charge_type": "GROUND_RENT", "scope_type": "ALL", "amount_paise": 100, "effective_from": "2050-04-01", "effective_to": "2050-01-01"}, headers=admin_h)
    assert bad.status_code == 422
    ok = client.post("/api/admin/rates", json={"charge_type": "GROUND_RENT", "scope_type": "ALL", "amount_paise": 100, "effective_from": "2050-04-01", "effective_to": "2051-03-31"}, headers=admin_h)
    assert ok.status_code == 201 and ok.json()["effective_to"] == "2051-03-31"
