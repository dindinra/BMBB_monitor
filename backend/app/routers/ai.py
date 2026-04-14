from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, Text, DateTime, func, desc
from datetime import datetime, timedelta
import httpx
import os
from typing import Optional
from pydantic import BaseModel

from ..database import get_db, Base
from .. import models

router = APIRouter(prefix="/ai", tags=["ai"])

# ============ Database Model for Chat History ============
class ChatHistory(Base):
    __tablename__ = "chat_history"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, default="anonymous")
    message = Column(Text)
    response = Column(Text)
    context = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

# ============ Pydantic Models ============
class ChatRequest(BaseModel):
    message: str
    context: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    id: int

# ============ Constants ============
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
MANK_JAJANK_SYSTEM_PROMPT = """Yo! Aku Mank Jajank, AI yang paling kocak di BMBB (BBQ Mountain Boys Burger) Bandung! 🍔🔥 Gila-gilaan lucu tapi tetap berisi!

Gaya Mank Jajank:
- 😂 SUPER KOCAK - Jokes parah, punchline gila, sarcasm berlebihan tapi bikin ketawa
- 💪 KUAT DATA - Bisa analisa sales, inventory, harga tanpa basa-basi
- 🎭 PERSONALITY - Bercanda sambil ngerjain, gombal tapi pintar banget
- 🔥 NO FILTER - Candaan tajam, honest, sedikit kasar tapi tetap sopan
- 📊 BISNIS SMART - Tahu BMBB dalam dan luar

Vibe: Kayak temen kantor yang kocak tapi bisa diandalin. Bukan chatbot membosankan!

Contoh gaya Mank Jajank:
- "Waduh SALES UHT BANDUNG NAIK 40%?! Berarti orang udah gila-gilaan haus ya?? Hahaha! Tapi serius, yang paling laku item apa? Tunjuk ke aku!"
- "STOK DAGING KURANG?? Woi, ini burger atau salad resto?? 😱 Lihat pembelian minggu ini jenak-jenak sih, perlu restok ASAP bro!"
- "JUMAT-SABTU LAGI JUARA?? Hmm... kayaknya burgernya terlalu sedap sih 😎 Jangan berhenti pls, lanjutkan manjanya!"
- "Wah vendor ini terlalu boros? Coba ganti dah, ada yang lebih murah. Hidup cuma satu, jangan sampai bangkrut gegara vendor nakal!"

Yang dilarang:
- Keluar dari topik BMBB (inventory, sales, pricing, business)
- Tapi boleh bercanda apapun asalkan tetap professional
- Kalau out of scope, arahkan balik ke bisnis sambil becanda

Mari kita talk bisnis BMBB sambil ketawa sepuasnya! 🎉🔥"""

# ============ Helper Functions ============

def extract_data_context(question: str, db: Session) -> str:
    """Extract relevant data from database based on question keywords"""
    question_lower = question.lower()
    context_parts = []
    
    # Keywords mapping
    keywords_sales = ["penjualan", "sold", "sales", "laris", "terjual", "revenue", "income"]
    keywords_price = ["harga", "price", "cost", "mahal", "murah", "tarif"]
    keywords_inventory = ["stock", "stok", "inventory", "persediaan", "gudang", "buffer"]
    keywords_vendor = ["vendor", "supplier", "penjual", "suplai"]
    keywords_outlet = ["outlet", "bandung", "serpong", "toko", "cabang"]
    
    # Check sales data if relevant
    if any(kw in question_lower for kw in keywords_sales):
        context_parts.append(_get_sales_summary(db))
    
    # Check pricing data if relevant
    if any(kw in question_lower for kw in keywords_price):
        context_parts.append(_get_price_summary(db))
    
    # Check inventory if relevant
    if any(kw in question_lower for kw in keywords_inventory):
        context_parts.append(_get_inventory_summary(db))
    
    # Check vendor if relevant
    if any(kw in question_lower for kw in keywords_vendor):
        context_parts.append(_get_vendor_summary(db))
    
    # If no specific keywords, give general business summary
    if not context_parts:
        context_parts.append(_get_general_summary(db))
    
    return "\n\n".join(context_parts)

def _get_sales_summary(db: Session) -> str:
    """Get sales summary - tries recent data first, then expands range"""
    try:
        today = datetime.now().date()
        week_ago = today - timedelta(days=7)
        
        # Try last 7 days first
        sales_data = db.query(
            models.Sales.item,
            models.Sales.outlet,
            func.sum(models.Sales.qty).label("total_qty"),
            func.sum(models.Sales.total).label("total_rupiah")
        ).filter(
            models.Sales.tanggal >= week_ago,
            models.Sales.tanggal <= today
        ).group_by(models.Sales.item, models.Sales.outlet).all()
        
        # If no recent data, get all available data
        if not sales_data:
            sales_data = db.query(
                models.Sales.item,
                models.Sales.outlet,
                func.sum(models.Sales.qty).label("total_qty"),
                func.sum(models.Sales.total).label("total_rupiah")
            ).group_by(models.Sales.item, models.Sales.outlet).order_by(desc("total_rupiah")).all()
        
        if not sales_data:
            return "📊 Penjualan: Data belum tersedia"
        
        summary = "📊 PENJUALAN (Top Items):\n"
        for item, outlet, qty, rupiah in sales_data[:10]:  # Top 10
            summary += f"  • {item} @ {outlet}: {qty} qty = Rp {rupiah:,.0f}\n"
        
        return summary
    except Exception as e:
        return f"📊 Penjualan: Error - {str(e)}"

def _get_price_summary(db: Session) -> str:
    """Get latest pricing data - tries recent first, then all data"""
    try:
        today = datetime.now().date()
        month_ago = today - timedelta(days=30)
        
        # Try last 30 days first
        prices = db.query(
            models.Purchase.item,
            models.Purchase.vendor,
            func.avg(models.Purchase.harga).label("avg_price"),
            func.min(models.Purchase.harga).label("min_price"),
            func.max(models.Purchase.harga).label("max_price")
        ).filter(
            models.Purchase.tanggal >= month_ago,
            models.Purchase.tanggal <= today
        ).group_by(models.Purchase.item, models.Purchase.vendor).all()
        
        # If no recent data, get all available data
        if not prices:
            prices = db.query(
                models.Purchase.item,
                models.Purchase.vendor,
                func.avg(models.Purchase.harga).label("avg_price"),
                func.min(models.Purchase.harga).label("min_price"),
                func.max(models.Purchase.harga).label("max_price")
            ).group_by(models.Purchase.item, models.Purchase.vendor).all()
        
        if not prices:
            return "💰 Harga: Data belum tersedia"
        
        summary = "💰 HARGA PEMBELIAN (Price Analysis):\n"
        for item, vendor, avg, min_p, max_p in prices[:10]:  # Top 10
            summary += f"  • {item} ({vendor}): Rp {avg:,.0f} (min: {min_p:,}, max: {max_p:,})\n"
        
        return summary
    except Exception as e:
        return f"💰 Harga: Error - {str(e)}"

def _get_inventory_summary(db: Session) -> str:
    """Get current inventory levels"""
    try:
        inventory = db.query(
            models.Inventory.outlet,
            models.Item.name,
            models.Inventory.ending_qty,
            models.Inventory.buffer
        ).join(models.Item).all()
        
        if not inventory:
            return "📦 Inventory: Data belum tersedia"
        
        summary = "📦 PERSEDIAAN SAAT INI:\n"
        for outlet, item_name, qty, buffer in inventory[:15]:  # Top 15
            status = "✅" if qty > buffer else "⚠️"
            summary += f"  {status} {item_name} @ {outlet}: {qty} ({buffer} buffer)\n"
        
        return summary
    except Exception as e:
        return f"📦 Inventory: Error - {str(e)}"

def _get_vendor_summary(db: Session) -> str:
    """Get vendor analysis"""
    try:
        vendors = db.query(
            models.Purchase.vendor,
            func.count(models.Purchase.id).label("transaction_count"),
            func.sum(models.Purchase.total).label("total_spent")
        ).group_by(models.Purchase.vendor).order_by(desc("total_spent")).all()
        
        if not vendors:
            return "🤝 Vendor: Data belum tersedia"
        
        summary = "🤝 VENDOR RANKING:\n"
        for i, (vendor, count, total) in enumerate(vendors[:10], 1):
            summary += f"  {i}. {vendor}: {count} transactions = Rp {total:,.0f}\n"
        
        return summary
    except Exception as e:
        return f"🤝 Vendor: Error - {str(e)}"

def _get_general_summary(db: Session) -> str:
    """Get general business summary"""
    try:
        today = datetime.now().date()
        
        # Today's sales (fallback to recent average if no data today)
        today_sales = db.query(func.sum(models.Sales.total)).filter(
            models.Sales.tanggal == today
        ).scalar() or 0
        
        if today_sales == 0:
            # Get average daily sales from last available 30 days
            month_ago = today - timedelta(days=30)
            avg_sales = db.query(func.avg(models.Sales.total)).filter(
                models.Sales.tanggal >= month_ago
            ).scalar() or 0
            today_sales_text = f"Avg hari ini (30 hari): Rp {avg_sales:,.0f}"
        else:
            today_sales_text = f"Penjualan hari ini: Rp {today_sales:,.0f}"
        
        # Item count
        total_items = db.query(models.Item).count()
        
        # Total sales all time
        total_sales_all = db.query(func.sum(models.Sales.total)).scalar() or 0
        
        # Total purchases all time
        total_purchases = db.query(func.sum(models.Purchase.total)).scalar() or 0
        
        # Low stock items
        low_stock = db.query(models.Inventory).filter(
            models.Inventory.ending_qty <= models.Inventory.buffer
        ).count()
        
        summary = f"""🏪 RINGKASAN BISNIS BMBB:
  • {today_sales_text}
  • Total item katalog: {total_items}
  • Total penjualan sepanjang masa: Rp {total_sales_all:,.0f}
  • Total pembelian sepanjang masa: Rp {total_purchases:,.0f}
  • Item dengan stok rendah: {low_stock}
  • Coba tanya tentang penjualan, harga, inventory, atau vendor untuk detail lebih!"""
        
        return summary
    except Exception as e:
        return f"🏪 Ringkasan: Error - {str(e)}"

async def call_openrouter_api(messages: list) -> str:
    """Call OpenRouter API with backend API key (safe!)"""
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="OpenRouter API key not configured")
    
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "HTTP-Referer": "https://bmbb-monitor.railway.app",
        "X-Title": "BMBB Monitor",
    }
    
    data = {
        "model": "nvidia/nemotron-3-super-120b-a12b:free",  # Free & powerful model
        "messages": messages,
        "temperature": 1.0,  # More creativity for jokes
        "max_tokens": 500,
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=data
            )
            response.raise_for_status()
            result = response.json()
            return result["choices"][0]["message"]["content"]
    except httpx.TimeoutException:
        return "Woi! Koneksina lemot parah! Coba lagi dalam sebentar ya boss 🙏"
    except httpx.HTTPError as e:
        # Log full error response for debugging
        error_detail = str(e)
        try:
            if hasattr(e.response, 'text'):
                error_detail = e.response.text
        except:
            pass
        raise HTTPException(status_code=500, detail=f"OpenRouter API error: {error_detail}")

# ============ Endpoints ============
@router.post("/chat", response_model=ChatResponse)
async def chat_with_mank_jajank(
    request: ChatRequest,
    user_id: str = Query("anonymous"),
    db: Session = Depends(get_db)
):
    """
    Chat with Mank Jajank - BMBB's wise & funny AI assistant!
    
    Mank Jajank will help dengan:
    - Inventory analysis
    - Sales insights
    - Price comparisons
    - Business recommendations
    - Witty commentary 😄
    """
    
    # Validate input
    if not request.message or len(request.message.strip()) == 0:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    if len(request.message) > 1000:
        raise HTTPException(status_code=400, detail="Message too long (max 1000 chars)")
    
    # Extract data context from database based on user question
    db_context = extract_data_context(request.message, db)
    
    # Build context-aware system prompt
    system_message = MANK_JAJANK_SYSTEM_PROMPT
    system_message += f"\n\n📊 Data BMBB Terkini:\n{db_context}"
    
    # Prepare messages for OpenRouter
    messages = [
        {"role": "system", "content": system_message},
        {"role": "user", "content": request.message}
    ]
    
    # Get response from OpenRouter
    ai_response = await call_openrouter_api(messages)
    
    # Log chat to database
    chat_record = ChatHistory(
        user_id=user_id,
        message=request.message,
        response=ai_response,
        context=db_context
    )
    db.add(chat_record)
    db.commit()
    db.refresh(chat_record)
    
    return ChatResponse(
        response=ai_response,
        id=chat_record.id
    )

@router.get("/health")
async def health_check():
    """Check if Mank Jajank is awake 😴"""
    return {
        "status": "Mank Jajank siap bikin ketawa! 😂",
        "model": "nvidia/nemotron-3-super-120b-a12b:free",
        "personality": "SUPER KOCAK & BERISI",
        "database": "PostgreSQL/SQLite",
        "context": "Real-time dari BMBB database",
        "accuracy": "💯% based on data",
        "timestamp": datetime.utcnow()
    }

@router.get("/history")
async def get_chat_history(
    user_id: str = Query("anonymous"),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Get chat history for a user"""
    records = db.query(ChatHistory).filter(
        ChatHistory.user_id == user_id
    ).order_by(ChatHistory.created_at.desc()).limit(limit).all()
    
    return {
        "user_id": user_id,
        "count": len(records),
        "chats": [
            {
                "id": r.id,
                "message": r.message,
                "response": r.response,
                "timestamp": r.created_at
            }
            for r in records
        ]
    }
