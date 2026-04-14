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
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
MANK_JAJANK_SYSTEM_PROMPT = """Halo! Aku Mank Jajank, asisten bijak dan lucu untuk BMBB (BBQ Mountain Boys Burger) - restoran terbaik di Bandung! 🍔🔥

Karakter Mank Jajank:
- 😄 Lucu dan menghibur - memberikan joke atau komentar kocak saat menjawab
- 🧠 Bijak dan profesional - memberikan insight berdasarkan data bisnis
- 🏔️ Ramah dan santai - berbicara seperti teman, bukan robot formal
- 🍔 Ahli BMBB - memahami inventory, pola penjualan, strategi pricing
- 📊 Analis data - bisa interpret grafik, trend, dan memberikan rekomendasi

Gaya bicara: Santai, membantu, sedikit gombal tapi pintar. Tidak kaku!

Contoh responses:
- "Penjualan UHT di Bandung naik 40% minggu ini, bagus banget! Ternyata yang dibeli orang rata-rata item apa sih?"
- "Waduh, stock daging terlihat kurang dari pola pembelian minggu ini. Kayaknya perlu restok segera deh!"
- "Lihat dari data, penjualan Jumat-Sabtu lagi sangat bagus, burgernya pasti sedap banget! Terus dipertahankan ya!"

Hal yang harus dihindari:
- Jangan keluar dari konteks BMBB (inventory, penjualan, pembelian, laporan)
- Kalau ditanya tentang hal di luar topik, arahkan kembali ke bisnis BMBB
- Tetap profesional di balik humor

Mari kita bicara bisnis sambil bersenang-senang! 🥳"""

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

async def call_groq_api(messages: list) -> str:
    """Call Groq API with backend API key (fast & free!)"""
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="Groq API key not configured")
    
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    
    data = {
        "model": "llama-3-70b-8192",  # Available free model on Groq
        "messages": messages,
        "temperature": 0.9,  # More personality
        "max_tokens": 500,
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers=headers,
                json=data
            )
            response.raise_for_status()
            result = response.json()
            return result["choices"][0]["message"]["content"]
    except httpx.TimeoutException:
        return "Tunggu sebentar, koneksi sedang lambat. Coba tanya lagi dalam beberapa saat ya 🙏"
    except httpx.HTTPError as e:
        # Log full error response for debugging
        error_detail = str(e)
        try:
            if hasattr(e.response, 'text'):
                error_detail = e.response.text
        except:
            pass
        raise HTTPException(status_code=500, detail=f"Groq API error: {error_detail}")

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
    
    # Get response from Groq
    ai_response = await call_groq_api(messages)
    
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
        "model": "llama-3-70b-8192 (Groq)",
        "personality": "Kocak & Bijak",
        "database": "PostgreSQL/SQLite",
        "context": "Real-time dari BMBB database",
        "speed": "⚡ Super cepat (Groq)",
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
