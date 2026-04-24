from fastapi import FastAPI
import uvicorn
import asyncio
from .scheduler import NewsScheduler

app = FastAPI(title="UGT NLP Worker")

scheduler = NewsScheduler()

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(scheduler.start())

@app.get("/health")
async def health():
    return {"status": "OK", "scheduler": "running" if scheduler.running else "stopped"}

@app.get("/metrics")
async def metrics():
    return {"articles_processed": scheduler.articles_processed}

if __name__ == "__main__":
    port = 8002
    uvicorn.run(app, host="0.0.0.0", port=port)
