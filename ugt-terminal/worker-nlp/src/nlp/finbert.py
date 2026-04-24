from transformers import pipeline
import asyncio
import torch

class FinBERTPipeline:
    def __init__(self):
        self.model_name = "ProsusAI/finbert"
        # Force CPU for default deployment as per spec
        self.device = -1 
        self.pipe = pipeline("sentiment-analysis", model=self.model_name, device=self.device)

    async def analyze(self, text: str):
        # Run in executor to avoid blocking the event loop
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, lambda: self.pipe(text[:512])[0])
        
        # Mapping FinBERT: positive, negative, neutral
        label = result['label'].lower()
        score = result['score']
        
        pos = score if label == 'positive' else 0.0
        neg = score if label == 'negative' else 0.0
        neu = score if label == 'neutral' else 0.0
        
        return {
            "model": "finbert",
            "score_positive": pos,
            "score_negative": neg,
            "score_neutral": neu,
            "compound": pos - neg
        }
