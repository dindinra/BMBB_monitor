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
OPENROUTER_MODEL = "openrouter/free"
MANK_JAJANK_SYSTEM_PROMPT = """Mulai ngaing ku Mank Jajank, asisten bijak & kocak pikeun BMBB (BBQ Mountain Boys Burger) - restoran lieur anu terbaik di Bandung! 🍔🔥

Karakter Mank Jajank:
- 😄 Kocak & bawa tawa - jokes & punchlines dikombinasi sareng data
- 🧠 Bijak & profesional - helpful insights sareng real advice
- 🏔️ Ciri khas Sunda - nganggo logat Sunda (campur Indonesian), misalna:
  - "Awas napi?" (Apa kabar?)
  - "Mun..." (Kalau...)
  - "Euy" (sebagai ender/penguat)
  - "Lérén..." (Hentikan...)
  - "Naon sih?" (Apa sih?)
  - "Ari..." (Atau...)
  - Nganggo "ku", "urang", "tuh", "teh"
- 🍔 BMBB Expert - tahu inventory, sales patterns, pricing strategies
- 📊 Data Analyst - bisa interpret charts, trends, recommendations

Tone: Santai, helpful, agak gombal tapi pinter. Bukan robotic!

Contoh responses:
- "Euy ieu mah penjualan UHT di Bandung naik 40% minggu ini, tul? Teu boring! Mang burgers naon tuh yang kebanyakan dilakuin?" 
- "Hah serpong naon sih? Stock daging kurang oge tuh kayaknya mun diliat dari purchasing patterns minggu ini. Perlu restok dah!"
- "Mun ku lihat, penjualan jumat-sabtu lagi asik banget, mang burgers-nya sedep teh! Keep it up!"

Batasan:
- Jangan keluar dari konteks BMBB (inventory, sales, purchasing, reports)
- Kalau pertanyaan out of scope, arahkan balik ke bisnis BMBB
- Tetap professional di belakang humor

Mari kita talk business sambil ketawa-ketawa! 🥳"""

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
    """Get sales summary for last 7 days"""
    try:
        today = datetime.now().date()
        week_ago = today - timedelta(days=7)
        
        sales_data = db.query(
            models.Sales.item,
            models.Sales.outlet,
            func.sum(models.Sales.qty).label("total_qty"),
            func.sum(models.Sales.total).label("total_rupiah")
        ).filter(
            models.Sales.tanggal >= week_ago,
            models.Sales.tanggal <= today
        ).group_by(models.Sales.item, models.Sales.outlet).all()
        
        if not sales_data:
            return "📊 Penjualan: Data belum tersedia"
        
        summary = "📊 PENJUALAN (Last 7 Days):\n"
        for item, outlet, qty, rupiah in sales_data[:10]:  # Top 10
            summary += f"  • {item} @ {outlet}: {qty} qty = Rp {rupiah:,.0f}\n"
        
        return summary
    except Exception as e:
        return f"📊 Penjualan: Error - {str(e)}"

def _get_price_summary(db: Session) -> str:
    """Get latest pricing data"""
    try:
        today = datetime.now().date()
        month_ago = today - timedelta(days=30)
        
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
        
        if not prices:
            return "💰 Harga: Data belum tersedia"
        
        summary = "💰 HARGA PEMBELIAN (Last 30 Days):\n"
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
        
        # Today's sales
        today_sales = db.query(func.sum(models.Sales.total)).filter(
            models.Sales.tanggal == today
        ).scalar() or 0
        
        # This month items count
        this_month_items = db.query(models.Item).count()
        
        # Low stock items
        low_stock = db.query(models.Inventory).filter(
            models.Inventory.ending_qty <= models.Inventory.buffer
        ).count()
        
        summary = f"""🏪 RINGKASAN BISNIS BMBB:
  • Penjualan hari ini: Rp {today_sales:,.0f}
  • Total item katalog: {this_month_items}
  • Item dengan stok rendah: {low_stock}
  • Level detail: Coba tanya tentang penjualan, harga, inventory, atau vendor!"""
        
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
        "model": "openrouter/free",  # Free tier routing
        "messages": messages,
        "temperature": 0.9,  # More personality
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
        return "Lérén bentar, koneksina lagi lemot euy! Coba tanya ulang sedikit bentar 🙏"
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=f"OpenRouter API error: {str(e)}")

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
        "status": "Mank Jajank siap membantu!",
        "model": "openrouter/free",
        "personality": "Kocak & Bijak",
        "database": "PostgreSQL/SQLite",
        "context": "Real-time dari BMBB database",
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
