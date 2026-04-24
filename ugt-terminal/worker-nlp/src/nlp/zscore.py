import numpy as np
from collections import deque
from typing import Dict, List, Optional
import time

class ZScoreCalculator:
    def __init__(self, window_size: int = 30):
        # Ticker -> SourceClass -> Deque of compound scores
        self.history: Dict[str, Dict[str, deque]] = {}
        self.window_days = window_size
        # For simplicity in this demo, let's assume one update per day 
        # or we store timestamps and filter. 
        # Ideally, we should fetch from DB on startup.

    def _get_history(self, ticker: str, source_class: str) -> deque:
        if ticker not in self.history:
            self.history[ticker] = {"crypto_native": deque(maxlen=500), "tradfi": deque(maxlen=500)}
        return self.history[ticker][source_class]

    async def update(self, ticker: str, sentiment: Dict[str, float], source_class: str) -> Optional[float]:
        history = self._get_history(ticker, source_class)
        compound = sentiment['compound']
        history.append(compound)
        
        if len(history) < 50:
            return None # Not enough observations for stable Z-score
            
        mean = np.mean(history)
        std = np.std(history)
        
        if std == 0: return 0.0
        
        z_score = (compound - mean) / std
        return float(z_score)

    def get_divergence(self, ticker: str) -> Optional[float]:
        if ticker not in self.history: return None
        
        z_crypto = self._calculate_current_z(ticker, "crypto_native")
        z_tradfi = self._calculate_current_z(ticker, "tradfi")
        
        if z_crypto is None or z_tradfi is None:
            return None
            
        return z_crypto - z_tradfi

    def _calculate_current_z(self, ticker: str, source_class: str) -> Optional[float]:
        history = self._get_history(ticker, source_class)
        if len(history) < 50: return None
        
        mean = np.mean(history)
        std = np.std(history)
        if std == 0: return 0.0
        return (history[-1] - mean) / std
