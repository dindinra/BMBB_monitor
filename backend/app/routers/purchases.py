from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional, Dict, Any
from datetime import date, timedelta

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/purchases", tags=["purchases"])


@router.get("/")
def list_purchases(
    outlet: Optional[str] = Query(None, description="Filter by outlet"),
    start_date: Optional[date] = Query(None, description="Start date (inclusive)"),
    end_date: Optional[date] = Query(None, description="End date (inclusive)"),
    search: Optional[str] = Query(None, description="Search by item name or code (partial)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100000),
    db: Session = Depends(get_db)
):
    query = db.query(models.Purchase)

    if outlet:
        query = query.filter(models.Purchase.outlet == outlet)
    if start_date:
        query = query.filter(models.Purchase.tanggal >= start_date)
    if end_date:
        query = query.filter(models.Purchase.tanggal <= end_date)
    if search:
        query = query.filter(
            or_(
                models.Purchase.kode_item.ilike(f"%{search}%"),
                models.Purchase.item.ilike(f"%{search}%")
            )
        )

    # Get total count before pagination
    total = query.count()

    purchases = query.offset(skip).limit(limit).all()

    return {
        "items": purchases,
        "total": total,
        "skip": skip,
        "limit": limit
    }


@router.get("/{purchase_id}", response_model=schemas.PurchaseInDB)
def get_purchase(purchase_id: int, db: Session = Depends(get_db)):
    purchase = db.query(models.Purchase).filter(models.Purchase.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    return purchase


@router.get("/aggregate/monthly")
def aggregate_monthly(
    outlet: Optional[str] = Query(None, description="Filter by outlet"),
    tipe_item: Optional[str] = Query(None, description="Filter by tipe_item"),
    year: Optional[int] = Query(None, description="Filter by year"),
    start_date: Optional[date] = Query(None, description="Start date (inclusive)"),
    end_date: Optional[date] = Query(None, description="End date (inclusive)"),
    db: Session = Depends(get_db)
):
    """Return monthly purchase totals grouped by outlet."""
    from sqlalchemy import func
    from ..database import format_date_column

    query = db.query(
        format_date_column(models.Purchase.tanggal, '%Y').label('year'),
        format_date_column(models.Purchase.tanggal, '%m').label('month_num'),
        format_date_column(models.Purchase.tanggal, '%Y-%m').label('month'),
        models.Purchase.outlet,
        func.sum(models.Purchase.total).label('total_amount'),
        func.sum(models.Purchase.qty).label('total_qty'),
        func.count().label('count')
    )

    if outlet:
        query = query.filter(models.Purchase.outlet == outlet)
    if tipe_item:
        query = query.filter(models.Purchase.tipe_item == tipe_item)
    if year:
        query = query.filter(models.Purchase.tahun == year)
    if start_date:
        query = query.filter(models.Purchase.tanggal >= start_date)
    if end_date:
        query = query.filter(models.Purchase.tanggal <= end_date)

    query = query.group_by('year', 'month_num', 'month', 'outlet').order_by('year', 'month_num', 'outlet')

    results = query.all()

    return [
        {
            "year": int(r.year) if r.year else None,
            "month": r.month,
            "month_num": int(r.month_num) if r.month_num else 0,
            "outlet": r.outlet,
            "total_amount": r.total_amount,
            "total_qty": r.total_qty,
            "count": r.count
        }
        for r in results
    ]


@router.get("/distinct/tipe_items")
def distinct_tipe_items(db: Session = Depends(get_db)):
    """Return list of distinct tipe_item values."""
    results = db.query(models.Purchase.tipe_item).distinct().order_by(models.Purchase.tipe_item).all()
    return [r[0] for r in results]


@router.get("/distinct/years")
def distinct_years(db: Session = Depends(get_db)):
    """Return list of distinct years from purchase tahun."""
    results = db.query(models.Purchase.tahun).distinct().order_by(models.Purchase.tahun).all()
    return [r[0] for r in results if r[0] is not None]


@router.get("/aggregate/top_items_by_qty")
def top_items_by_qty(
    outlet: Optional[str] = Query(None, description="Filter by outlet"),
    tipe_item: Optional[str] = Query(None, description="Filter by tipe_item"),
    year: Optional[int] = Query(None, description="Filter by year"),
    start_date: Optional[date] = Query(None, description="Start date (inclusive)"),
    end_date: Optional[date] = Query(None, description="End date (inclusive)"),
    limit: int = Query(5, ge=1, le=50),
    db: Session = Depends(get_db)
):
    """Return top N items by total quantity purchased."""
    from sqlalchemy import func

    query = db.query(
        models.Purchase.item,
        models.Purchase.unit,
        func.sum(models.Purchase.qty).label('total_qty'),
        func.sum(models.Purchase.total).label('total_amount')
    )

    if outlet:
        query = query.filter(models.Purchase.outlet == outlet)
    if tipe_item:
        query = query.filter(models.Purchase.tipe_item == tipe_item)
    if year:
        query = query.filter(models.Purchase.tahun == year)
    if start_date:
        query = query.filter(models.Purchase.tanggal >= start_date)
    if end_date:
        query = query.filter(models.Purchase.tanggal <= end_date)

    query = query.group_by(models.Purchase.item, models.Purchase.unit).order_by(func.sum(models.Purchase.total).desc()).limit(limit)

    results = query.all()

    return [
        {
            "item": r.item,
            "unit": r.unit,
            "total_qty": r.total_qty,
            "total_amount": r.total_amount
        }
        for r in results
    ]


@router.get("/aggregate/top_vendors")
def top_vendors(
    outlet: Optional[str] = Query(None, description="Filter by outlet"),
    tipe_item: Optional[str] = Query(None, description="Filter by tipe_item"),
    year: Optional[int] = Query(None, description="Filter by year"),
    start_date: Optional[date] = Query(None, description="Start date (inclusive)"),
    end_date: Optional[date] = Query(None, description="End date (inclusive)"),
    limit: int = Query(5, ge=1, le=50),
    db: Session = Depends(get_db)
):
    """Return top N vendors by total purchase amount, with most frequent unit."""
    from sqlalchemy import func

    # Build base query with common filters
    from ..database import format_date_column
    base_q = db.query(models.Purchase)
    if outlet:
        base_q = base_q.filter(models.Purchase.outlet == outlet)
    if tipe_item:
        base_q = base_q.filter(models.Purchase.tipe_item == tipe_item)
    if year:
        base_q = base_q.filter(format_date_column(models.Purchase.tanggal, '%Y') == str(year))
    if start_date:
        base_q = base_q.filter(models.Purchase.tanggal >= start_date)
    if end_date:
        base_q = base_q.filter(models.Purchase.tanggal <= end_date)

    # Step 1: Get top vendors by total amount
    top_vendors = base_q.with_entities(
        models.Purchase.vendor,
        func.sum(models.Purchase.total).label('total_amount'),
        func.sum(models.Purchase.qty).label('total_qty')
    ).group_by(models.Purchase.vendor).order_by(func.sum(models.Purchase.total).desc()).limit(limit).all()

    vendor_names = [v.vendor for v in top_vendors]

    # Step 2: For these vendors, find the unit with highest total quantity per vendor
    unit_map = {}
    if vendor_names:
        unit_counts = base_q.filter(
            models.Purchase.vendor.in_(vendor_names)
        ).with_entities(
            models.Purchase.vendor,
            models.Purchase.unit,
            func.sum(models.Purchase.qty).label('unit_qty')
        ).group_by(models.Purchase.vendor, models.Purchase.unit).all()

        # For each vendor, pick the unit with max unit_qty
        for row in unit_counts:
            v = row.vendor
            u = row.unit
            q = row.unit_qty
            if v not in unit_map or q > unit_map[v][1]:
                unit_map[v] = (u, q)

    # Step 3: Build result with unit
    results = [
        {
            "vendor": v.vendor,
            "unit": unit_map.get(v.vendor, (None,))[0],  # get unit only
            "total_amount": v.total_amount,
            "total_qty": v.total_qty
        }
        for v in top_vendors
    ]

    return results


@router.get("/aggregate/summary")
def summary(
    outlet: Optional[str] = Query(None, description="Filter by outlet"),
    tipe_item: Optional[str] = Query(None, description="Filter by tipe_item"),
    year: Optional[int] = Query(None, description="Filter by year"),
    start_date: Optional[date] = Query(None, description="Start date (inclusive)"),
    end_date: Optional[date] = Query(None, description="End date (inclusive)"),
    db: Session = Depends(get_db)
):
    """Return summary totals (total_amount, total_qty, count) for the filtered dataset."""
    from sqlalchemy import func

    query = db.query(
        func.sum(models.Purchase.total).label('total_amount'),
        func.sum(models.Purchase.qty).label('total_qty'),
        func.count().label('count')
    )

    if outlet:
        query = query.filter(models.Purchase.outlet == outlet)
    if tipe_item:
        query = query.filter(models.Purchase.tipe_item == tipe_item)
    if year:
        query = query.filter(models.Purchase.tahun == year)
    if start_date:
        query = query.filter(models.Purchase.tanggal >= start_date)
    if end_date:
        query = query.filter(models.Purchase.tanggal <= end_date)

    result = query.first()

    return {
        "total_amount": result.total_amount or 0,
        "total_qty": result.total_qty or 0,
        "count": result.count or 0
    }


@router.get("/aggregate/by_tipe_item")
def by_tipe_item(
    outlet: Optional[str] = Query(None, description="Filter by outlet"),
    year: Optional[int] = Query(None, description="Filter by year"),
    start_date: Optional[date] = Query(None, description="Start date (inclusive)"),
    end_date: Optional[date] = Query(None, description="End date (inclusive)"),
    db: Session = Depends(get_db)
):
    """Return purchase summary grouped by tipe_item (total_amount, total_qty, count)."""
    from sqlalchemy import func
    query = db.query(
        models.Purchase.tipe_item,
        func.sum(models.Purchase.total).label('total_amount'),
        func.sum(models.Purchase.qty).label('total_qty'),
        func.count().label('count')
    )
    if outlet:
        query = query.filter(models.Purchase.outlet == outlet)
    if year:
        query = query.filter(models.Purchase.tahun == year)
    if start_date:
        query = query.filter(models.Purchase.tanggal >= start_date)
    if end_date:
        query = query.filter(models.Purchase.tanggal <= end_date)
    query = query.group_by(models.Purchase.tipe_item).order_by(models.Purchase.tipe_item)
    results = query.all()
    return [
        {
            "tipe_item": r.tipe_item or '',
            "total_amount": float(r.total_amount or 0),
            "total_qty": float(r.total_qty or 0),
            "count": r.count or 0
        }
        for r in results
    ]


@router.get("/aggregate/price_by_item")
def price_by_item(
    item: Optional[str] = Query(None, description="Filter by item name (partial match)"),
    outlet: Optional[str] = Query(None, description="Filter by outlet"),
    tipe_item: Optional[str] = Query(None, description="Filter by tipe_item"),
    year: Optional[int] = Query(None, description="Filter by year"),
    start_date: Optional[date] = Query(None, description="Start date (inclusive)"),
    end_date: Optional[date] = Query(None, description="End date (inclusive)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """Return average price per item comparison across outlets (paginated)."""
    from sqlalchemy import func

    # Subquery to get avg price per (item, outlet) and the unit (using MIN as they should be consistent)
    subq = db.query(
        models.Purchase.item,
        models.Purchase.outlet,
        func.avg(models.Purchase.harga).label('avg_price'),
        func.min(models.Purchase.unit).label('unit'),  # assuming unit is consistent per item
        func.count().label('count')
    )

    if item:
        subq = subq.filter(models.Purchase.item.ilike(f"%{item}%"))
    if outlet:
        subq = subq.filter(models.Purchase.outlet == outlet)
    if tipe_item:
        subq = subq.filter(models.Purchase.tipe_item == tipe_item)
    if year:
        from ..database import format_date_column
        subq = subq.filter(format_date_column(models.Purchase.tanggal, '%Y') == str(year))
    if start_date:
        subq = subq.filter(models.Purchase.tanggal >= start_date)
    if end_date:
        subq = subq.filter(models.Purchase.tanggal <= end_date)

    subq = subq.group_by(models.Purchase.item, models.Purchase.outlet).subquery()

    # Fetch raw rows
    results = db.query(subq).order_by(subq.c.item, subq.c.outlet).all()

    # Transform into structure: { item: { unit: ..., outlets: { outlet1: price1, outlet2: price2 } } }
    item_map = {}
    outlets_set = set()
    for row in results:
        # Sanitize strings: remove control chars (0-31 except \n\r\t)
        raw_item = str(row.item)
        raw_outlet = str(row.outlet)
        raw_unit = str(row.unit)
        item = ''.join(ch if ord(ch) >= 32 or ch in '\n\r\t' else '?' for ch in raw_item)
        outlet = ''.join(ch if ord(ch) >= 32 or ch in '\n\r\t' else '?' for ch in raw_outlet)
        unit = ''.join(ch if ord(ch) >= 32 or ch in '\n\r\t' else '?' for ch in raw_unit)
        price = float(row.avg_price)
        if item not in item_map:
            item_map[item] = {'unit': unit, 'outlets': {}}
        item_map[item]['outlets'][outlet] = price
        outlets_set.add(outlet)

    # Build full response array sorted by item name
    # Filter: Only include items that exist in BOTH outlets (assuming exactly two outlets: bandung & serpong)
    all_items = []
    for item, data in sorted(item_map.items()):
        outlet_prices = data['outlets']
        unit = data['unit']
        # Keep only if has both bandung and serpong
        if 'bandung' in outlet_prices and 'serpong' in outlet_prices:
            entry = {"item": item, "unit": unit}
            for out in sorted(outlets_set):
                entry[out] = outlet_prices.get(out, None)
            all_items.append(entry)

    total = len(all_items)
    # Paginate
    paged_items = all_items[skip:skip+limit]

    return {
        "items": paged_items,
        "outlets": sorted(list(outlets_set)),
        "total_items": total,
        "skip": skip,
        "limit": limit
    }


@router.get("/aggregate/price_comparison")
def price_comparison(
    outlet: Optional[str] = Query(None, description="Filter by outlet"),
    tipe_item: Optional[str] = Query(None, description="Filter by tipe_item"),
    year: Optional[int] = Query(None, description="Filter by year"),
    start_date: Optional[date] = Query(None, description="Start date (inclusive)"),
    end_date: Optional[date] = Query(None, description="End date (inclusive)"),
    db: Session = Depends(get_db)
):
    """Return average price per unit comparison by outlet."""
    from sqlalchemy import func, case

    query = db.query(
        models.Purchase.outlet,
        func.sum(models.Purchase.total).label('total_amount'),
        func.sum(models.Purchase.qty).label('total_qty'),
        func.count().label('transaction_count')
    )

    if outlet:
        query = query.filter(models.Purchase.outlet == outlet)
    if tipe_item:
        query = query.filter(models.Purchase.tipe_item == tipe_item)
    if year:
        query = query.filter(models.Purchase.tahun == year)
    if start_date:
        query = query.filter(models.Purchase.tanggal >= start_date)
    if end_date:
        query = query.filter(models.Purchase.tanggal <= end_date)

    query = query.group_by(models.Purchase.outlet).order_by(models.Purchase.outlet)

    results = query.all()

    return [
        {
            "outlet": r.outlet,
            "total_amount": r.total_amount,
            "total_qty": r.total_qty,
            "avg_price": r.total_amount / r.total_qty if r.total_qty > 0 else 0,
            "transaction_count": r.transaction_count
        }
        for r in results
    ]


@router.get("/aggregate/last_cost")
def last_cost(
    outlet: Optional[str] = Query(None, description="Filter by outlet"),
    tipe_item: Optional[str] = Query(None, description="Filter by tipe_item"),
    year: Optional[int] = Query(None, description="Filter by year"),
    start_date: Optional[date] = Query(None, description="Start date (inclusive)"),
    end_date: Optional[date] = Query(None, description="End date (inclusive)"),
    search: Optional[str] = Query(None, description="Search by item name or code (partial)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """Return latest purchase per item (by tanggal) with vendor, unit, harga."""
    from sqlalchemy import func
    from ..database import format_date_column

    # Base query with filters
    base_q = db.query(models.Purchase)
    if outlet:
        base_q = base_q.filter(models.Purchase.outlet == outlet)
    if tipe_item:
        base_q = base_q.filter(models.Purchase.tipe_item == tipe_item)
    if year:
        base_q = base_q.filter(format_date_column(models.Purchase.tanggal, '%Y') == str(year))
    if start_date:
        base_q = base_q.filter(models.Purchase.tanggal >= start_date)
    if end_date:
        base_q = base_q.filter(models.Purchase.tanggal <= end_date)
    if search:
        base_q = base_q.filter(
            or_(
                models.Purchase.kode_item.ilike(f"%{search}%"),
                models.Purchase.item.ilike(f"%{search}%")
            )
        )

    # Subquery: latest tanggal per item
    subq = base_q.with_entities(
        models.Purchase.item,
        func.max(models.Purchase.tanggal).label('latest_tanggal')
    ).group_by(models.Purchase.item).subquery()

    # Join to get full records
    query = base_q.join(
        subq,
        (models.Purchase.item == subq.c.item) &
        (models.Purchase.tanggal == subq.c.latest_tanggal)
    )

    total = query.count()

    purchases = query.order_by(models.Purchase.tanggal.desc(), models.Purchase.item).offset(skip).limit(limit).all()

    # Sanitize strings (remove control chars)
    def sanitize(s):
        if s is None:
            return s
        return ''.join(ch if ord(ch) >= 32 or ch in '\n\r\t' else '?' for ch in str(s))

    items = []
    for p in purchases:
        items.append({
            "item": sanitize(p.item),
            "vendor": sanitize(p.vendor),
            "tanggal": p.tanggal.isoformat() if p.tanggal else None,
            "unit": sanitize(p.unit),
            "harga": p.harga,
            "outlet": sanitize(p.outlet)
        })

    return {
        "items": items,
        "total": total,
        "skip": skip,
        "limit": limit
    }


@router.get("/aggregate/price_history")
def price_history(
    item: Optional[str] = Query(None, description="Filter by item name (partial match)"),
    outlet: Optional[str] = Query(None, description="Filter by outlet"),
    tipe_item: Optional[str] = Query(None, description="Filter by tipe_item"),
    start_date: Optional[date] = Query(None, description="Start date (inclusive)"),
    end_date: Optional[date] = Query(None, description="End date (inclusive)"),
    group_by: str = Query("month", regex="^(day|month|year)$"),
    skip: int = Query(0, ge=0),
    limit: int = Query(1000, ge=1, le=10000),
    db: Session = Depends(get_db)
):
    """Return price history over time per item-outlet combination."""
    from sqlalchemy import func

    # Sanitization helper
    def sanitize(s):
        if s is None:
            return s
        return ''.join(ch if ord(ch) >= 32 or ch in '\n\r\t' else '?' for ch in str(s))

    # Determine period expression based on group_by
    from ..database import format_date_column
    if group_by == "day":
        period_expr = format_date_column(models.Purchase.tanggal, '%Y-%m-%d')
    elif group_by == "month":
        period_expr = format_date_column(models.Purchase.tanggal, '%Y-%m')
    else:  # year
        period_expr = format_date_column(models.Purchase.tanggal, '%Y')

    # Build base query
    query = db.query(
        models.Purchase.item,
        models.Purchase.outlet,
        period_expr.label('period')
    ).add_columns(
        func.min(models.Purchase.unit).label('unit'),
        func.avg(models.Purchase.harga).label('avg_price'),
        func.count().label('txn_count')
    )

    # Apply filters
    if item:
        query = query.filter(models.Purchase.item.ilike(f"%{item}%"))
    if outlet:
        query = query.filter(models.Purchase.outlet == outlet)
    if tipe_item:
        query = query.filter(models.Purchase.tipe_item == tipe_item)
    if start_date:
        query = query.filter(models.Purchase.tanggal >= start_date)
    if end_date:
        query = query.filter(models.Purchase.tanggal <= end_date)

    # Group by item, outlet, period
    query = query.group_by(models.Purchase.item, models.Purchase.outlet, 'period')
    query = query.order_by(models.Purchase.item, models.Purchase.outlet, 'period')

    # Get total count before pagination
    total = query.count()

    # Apply pagination
    results = query.offset(skip).limit(limit).all()

    # Build response
    items = []
    for r in results:
        items.append({
            "item": sanitize(r.item),
            "outlet": sanitize(r.outlet),
            "period": r.period,
            "unit": sanitize(r.unit),
            "avg_price": float(r.avg_price) if r.avg_price is not None else 0,
            "txn_count": r.txn_count
        })

    return {
        "items": items,
        "total": total,
        "skip": skip,
        "limit": limit
    }


@router.post("/", response_model=schemas.PurchaseInDB, status_code=201)
def create_purchase(purchase: schemas.PurchaseCreate, db: Session = Depends(get_db)):
    # Check if duplicate? Not needed, allow duplicate rows.
    db_purchase = models.Purchase(**purchase.model_dump())
    db.add(db_purchase)
    db.commit()
    db.refresh(db_purchase)
    return db_purchase


@router.put("/{purchase_id}", response_model=schemas.PurchaseInDB)
def update_purchase(
    purchase_id: int,
    purchase_update: schemas.PurchaseUpdate,
    db: Session = Depends(get_db)
):
    db_purchase = db.query(models.Purchase).filter(models.Purchase.id == purchase_id).first()
    if not db_purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")

    update_data = purchase_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_purchase, field, value)

    db.commit()
    db.refresh(db_purchase)
    return db_purchase


@router.delete("/{purchase_id}", status_code=204)
def delete_purchase(purchase_id: int, db: Session = Depends(get_db)):
    db_purchase = db.query(models.Purchase).filter(models.Purchase.id == purchase_id).first()
    if not db_purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    db.delete(db_purchase)
    db.commit()
    return {"ok": True}


@router.post("/clear_by_month")
def clear_purchases_by_month(
    year: int = Query(..., ge=2000, le=2100, description="Year (e.g., 2025)"),
    month: int = Query(..., ge=1, le=12, description="Month (1-12)"),
    db: Session = Depends(get_db)
):
    """Delete all purchases for a specific year-month."""
    try:
        start_date = date(year, month, 1)
        if month == 12:
            end_date = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = date(year, month + 1, 1) - timedelta(days=1)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid date: {e}")

    count = db.query(models.Purchase).filter(
        models.Purchase.tanggal >= start_date,
        models.Purchase.tanggal <= end_date
    ).delete(synchronize_session=False)
    db.commit()
    return {
        "message": f"Deleted {count} purchases for {year}-{month:02d}",
        "year": year,
        "month": month,
        "deleted_count": count
    }