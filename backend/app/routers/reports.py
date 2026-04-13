from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import HTMLResponse
from datetime import datetime, timedelta
from sqlalchemy import func, extract
from ..database import SessionLocal
from ..models import Purchase, Sales

router = APIRouter(prefix="/reports", tags=["reports"])

def get_date_range(month: str = None, start_date: str = None, end_date: str = None):
    if start_date and end_date:
        return start_date, end_date
    if month:
        try:
            year, mon = map(int, month.split('-'))
            start = f"{year}-{mon:02d}-01"
            if mon == 12:
                end = f"{year+1}-01-01"
            else:
                end = f"{year}-{mon+1:02d}-01"
            end_dt = datetime.strptime(end, '%Y-%m-%d') - timedelta(days=1)
            return start, end_dt.strftime('%Y-%m-%d')
        except:
            return None, None
    return None, None

@router.get("/html", response_class=HTMLResponse)
def html_report(
    report_type: str = Query(..., regex="^(sales|purchase)$"),
    month: str = None,
    outlet: str = "all",
    start_date: str = None,
    end_date: str = None
):
    start, end = get_date_range(month, start_date, end_date)
    db = SessionLocal()
    try:
        Model = Sales if report_type == "sales" else Purchase
        # Base query
        q = db.query(Model)
        if outlet != "all":
            q = q.filter(Model.outlet == outlet)
        if start and end:
            q = q.filter(Model.tanggal >= start, Model.tanggal <= end)

        # Summary
        summary_q = db.query(
            func.coalesce(func.sum(Model.total), 0).label('total_amount'),
            func.coalesce(func.sum(Model.qty), 0).label('total_qty'),
            func.count().label('count')
        ).filter(q.whereclause) if q.whereclause is not None else db.query(
            func.coalesce(func.sum(Model.total), 0),
            func.coalesce(func.sum(Model.qty), 0),
            func.count()
        )
        # If whereclause is None, the filters were none -> we don't filter
        # But we need to avoid .filter(None). So we handle two cases.
        if q.whereclause is None:
            summary = summary_q[0]
        else:
            summary = summary_q.first()
        summary = {
            'total_amount': summary.total_amount or 0,
            'total_qty': summary.total_qty or 0,
            'count': summary.count or 0
        }

        # Monthly breakdown
        from app.database import format_date_column
        if q.whereclause is not None:
            monthly_q = db.query(
                format_date_column(Model.tanggal, '%Y-%m').label('month'),
                func.sum(Model.total).label('amount'),
                func.sum(Model.qty).label('qty')
            ).filter(q.whereclause).group_by('month').order_by('month')
        else:
            monthly_q = db.query(
                format_date_column(Model.tanggal, '%Y-%m').label('month'),
                func.sum(Model.total).label('amount'),
                func.sum(Model.qty).label('qty')
            ).group_by('month').order_by('month')
        monthly = [
            {'month': str(r.month) if r.month else '', 'amount': r.amount or 0, 'qty': r.qty or 0}
            for r in monthly_q.all()
        ]

        # Top Items
        if q.whereclause is not None:
            top_items_q = db.query(
                Model.item,
                Model.unit,
                func.sum(Model.total).label('total_amount'),
                func.sum(Model.qty).label('total_qty')
            ).filter(q.whereclause).group_by(Model.item, Model.unit)\
             .order_by(func.sum(Model.total).desc()).limit(5)
        else:
            top_items_q = db.query(
                Model.item,
                Model.unit,
                func.sum(Model.total).label('total_amount'),
                func.sum(Model.qty).label('total_qty')
            ).group_by(Model.item, Model.unit)\
             .order_by(func.sum(Model.total).desc()).limit(5)
        top_items = [
            {'item': r.item, 'unit': r.unit, 'total_amount': r.total_amount or 0, 'total_qty': r.total_qty or 0}
            for r in top_items_q.all()
        ]

        # By Tipe Item
        if q.whereclause is not None:
            tipe_q = db.query(
                Model.tipe_item,
                func.sum(Model.total).label('total_amount'),
                func.sum(Model.qty).label('total_qty'),
                func.count().label('count')
            ).filter(q.whereclause).group_by(Model.tipe_item)\
             .order_by(func.sum(Model.total).desc())
        else:
            tipe_q = db.query(
                Model.tipe_item,
                func.sum(Model.total).label('total_amount'),
                func.sum(Model.qty).label('total_qty'),
                func.count().label('count')
            ).group_by(Model.tipe_item)\
             .order_by(func.sum(Model.total).desc())
        tipe_item = [
            {'tipe_item': r.tipe_item, 'total_amount': r.total_amount or 0, 'total_qty': r.total_qty or 0, 'count': r.count or 0}
            for r in tipe_q.all()
        ]

        # Top Vendors (purchase only)
        top_vendors = []
        if report_type == "purchase":
            if q.whereclause is not None:
                vendor_q = db.query(
                    Model.vendor,
                    func.sum(Model.total).label('total_amount'),
                    func.sum(Model.qty).label('total_qty'),
                    func.count().label('count')
                ).filter(q.whereclause).group_by(Model.vendor)\
                 .order_by(func.sum(Model.total).desc()).limit(5)
            else:
                vendor_q = db.query(
                    Model.vendor,
                    func.sum(Model.total).label('total_amount'),
                    func.sum(Model.qty).label('total_qty'),
                    func.count().label('count')
                ).group_by(Model.vendor)\
                 .order_by(func.sum(Model.total).desc()).limit(5)
            top_vendors = [
                {'vendor': r.vendor, 'total_amount': r.total_amount or 0, 'total_qty': r.total_qty or 0, 'count': r.count or 0}
                for r in vendor_q.all()
            ]

        # Build HTML
        def fmt_rupiah(value):
            try:
                num = float(value)
                return f"Rp {num:,.0f}".replace(",", ".")
            except:
                return "Rp 0"

        monthly_rows = "".join(
            f"<tr><td>{m['month']}</td><td style='text-align:right'>{fmt_rupiah(m['amount'])}</td><td style='text-align:right'>{m['qty']:,}</td></tr>"
            for m in monthly
        )
        top_items_rows = "".join(
            f"<tr><td>{i+1}</td><td>{it['item']}</td><td>{it['unit']}</td><td style='text-align:right'>{fmt_rupiah(it['total_amount'])}</td><td style='text-align:right'>{it['total_qty']:,}</td></tr>"
            for i, it in enumerate(top_items)
        )
        tipe_rows = "".join(
            f"<tr><td>{t['tipe_item']}</td><td style='text-align:right'>{fmt_rupiah(t['total_amount'])}</td><td style='text-align:right'>{t['total_qty']:,}</td><td style='text-align:right'>{t['count']:,}</td></tr>"
            for t in tipe_item
        )
        vendor_rows = "".join(
            f"<tr><td>{i+1}</td><td>{v['vendor']}</td><td style='text-align:right'>{fmt_rupiah(v['total_amount'])}</td><td style='text-align:right'>{v['total_qty']:,}</td><td style='text-align:right'>{v['count']:,}</td></tr>"
            for i, v in enumerate(top_vendors)
        ) if top_vendors else ""

        period_str = f"{start} s/d {end}" if start and end else f"Bulan {month}" if month else "All Time"

        html = f"""
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>BMBB {report_type.title()} Report</title>
<style>
body{{font-family:Arial,sans-serif;margin:20px;background:#f5f5f5;color:#333}}
.container{{max-width:1000px;margin:auto;background:white;padding:20px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1)}}
h1,h2{{color:#2c3e50}}
.summary{{display:flex;gap:20px;margin-bottom:20px;flex-wrap:wrap}}
.card{{flex:1;min-width:150px;background:#e8f4fd;padding:15px;border-radius:6px;border-left:4px solid #3498db;margin:5px}}
.card h3{{margin:0 0 10px 0;font-size:14px;color:#7f8c8d}}
.card .value{{font-size:24px;font-weight:bold;color:#2980b9}}
table{{width:100%;border-collapse:collapse;margin-bottom:20px}}
th,td{{padding:10px;text-align:left;border-bottom:1px solid #ddd}}
th{{background:#f1f8ff;color:#333;font-weight:600}}
tr:hover{{background:#f9f9f9}}
.right{{text-align:right}}
.footer{{margin-top:30px;font-size:12px;color:#aaa;text-align:center}}
</style>
</head>
<body>
<div class="container">
<h1>BMBB {report_type.title()} Report</h1>
<p>Periode: {period_str}</p>
<div class="summary">
<div class="card"><h3>Total Amount</h3><div class="value">{fmt_rupiah(summary['total_amount'])}</div></div>
<div class="card"><h3>Total Quantity</h3><div class="value">{summary['total_qty']:,}</div></div>
<div class="card"><h3>Transactions</h3><div class="value">{summary['count']:,}</div></div>
</div>
<h2>Monthly Breakdown</h2>
<table>
<thead><tr><th>Month</th><th class="right">Amount</th><th class="right">Qty</th></tr></thead>
<tbody>{monthly_rows if monthly_rows else '<tr><td colspan="3">No data</td></tr>'}</tbody>
</table>
<h2>Top 5 Items by Amount</h2>
<table>
<thead><tr><th>Rank</th><th>Item</th><th>Unit</th><th class="right">Amount</th><th class="right">Qty</th></tr></thead>
<tbody>{top_items_rows if top_items_rows else '<tr><td colspan="5">No data</td></tr>'}</tbody>
</table>
<h2>Tipe Item Distribution</h2>
<table>
<thead><tr><th>Tipe Item</th><th class="right">Amount</th><th class="right">Qty</th><th class="right">Transactions</th></tr></thead>
<tbody>{tipe_rows if tipe_rows else '<tr><td colspan="4">No data</td></tr>'}</tbody>
</table>
{f'''<h2>Top 5 Vendors by Purchase</h2>
<table>
<thead><tr><th>Rank</th><th>Vendor</th><th class="right">Amount</th><th class="right">Qty</th><th class="right">Transactions</th></tr></thead>
<tbody>{vendor_rows}</tbody>
</table>''' if report_type=='purchase' and vendor_rows else ''}
<div class="footer">Generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} by Mang Bebekyu Assistant</div>
</div>
</body>
</html>
"""
        return HTMLResponse(content=html)
    finally:
        db.close()
