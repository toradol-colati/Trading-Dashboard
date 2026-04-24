from fastapi import FastAPI
import uvicorn
import asyncio
from .scheduler import DataScheduler

app = FastAPI(title="UGT Data Worker")

scheduler = DataScheduler()

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(scheduler.start())

@app.get("/health")
async def health():
    return {"status": "OK", "scheduler": "running" if scheduler.running else "stopped"}

@app.get("/metrics")
async def metrics():
    # In a real app we'd return actual metrics from the sources
    return {"sources": len(scheduler.sources)}

if __name__ == "__main__":
    port = 8001
    uvicorn.run(app, host="0.0.0.0", port=port)
