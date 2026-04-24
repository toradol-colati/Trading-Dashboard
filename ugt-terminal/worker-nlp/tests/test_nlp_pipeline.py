import pytest
from src.nlp.ticker_ner import TickerNER
from src.nlp.zscore import ZScoreCalculator

def test_ticker_ner_extraction():
    ner = TickerNER()
    text = "Bitcoin is bullish! $ETH also looks good. AAPL is neutral."
    found = ner.extract(text)
    assert "BTC" in found
    assert "ETH" in found
    assert "AAPL" in found
    assert len(found) == 3

@pytest.mark.asyncio
async def test_zscore_calculation():
    calc = ZScoreCalculator(window_size=30)
    ticker = "BTC"
    source_class = "crypto_native"
    
    # Simulate some history
    for _ in range(55):
        await calc.update(ticker, {"compound": 0.5}, source_class)
        
    # Latest update
    z = await calc.update(ticker, {"compound": 1.0}, source_class)
    assert z is not None
    assert z > 0  # Should be positive since 1.0 > 0.5

def test_divergence_calculation():
    calc = ZScoreCalculator()
    ticker = "BTC"
    
    # Populate both classes
    import asyncio
    loop = asyncio.get_event_loop()
    
    for _ in range(55):
        loop.run_until_complete(calc.update(ticker, {"compound": 0.5}, "crypto_native"))
        loop.run_until_complete(calc.update(ticker, {"compound": -0.5}, "tradfi"))
        
    div = calc.get_divergence(ticker)
    assert div is not None
    assert div > 1.0  # (z_pos - z_neg)
