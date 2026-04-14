from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, Text, DateTime
from datetime import datetime
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
    
    # Build context-aware system prompt
    system_message = MANK_JAJANK_SYSTEM_PROMPT
    if request.context:
        system_message += f"\n\nKonteks data BMBB saat ini:\n{request.context}"
    
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
        context=request.context
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
        "model": "openrouter/auto",
        "personality": "Kocak & Bijak",
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
