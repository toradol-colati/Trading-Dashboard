from transformers import pipeline
import asyncio
import torch

class CryptoBERTPipeline:
    def __init__(self):
        self.model_name = "ElKulako/cryptobert"
        self.device = -1 
        self.pipe = pipeline("sentiment-analysis", model=self.model_name, device=self.device)

    async def analyze(self, text: str):
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, lambda: self.pipe(text[:512])[0])
        
        # CryptoBERT labels are often slightly different, but we normalize to pos/neg/neu
        label = result['label'].lower()
        score = result['score']
        
        # Mapping depends on specific model labels, assuming standard pos/neg/neu
        pos = score if 'positive' in label or 'bullish' in label else 0.0
        neg = score if 'negative' in label or 'bearish' in label else 0.0
        neu = score if 'neutral' in label else 0.0
        
        return {
            "model": "cryptobert",
            "score_positive": pos,
            "score_negative": neg,
            "score_neutral": neu,
            "compound": pos - neg
        }
