import json
import os
import pytest
from src.clients.defillama import DefiLlamaClient
from src.clients.dexscreener import DexScreenerClient
from src.clients.fred import FredClient
from src.clients.tradingeconomics import TradingEconomicsClient
from src.clients.coinmarketcap import CoinMarketCapClient
from src.clients.messari import MessariClient
from src.clients.dune import DuneClient
from src.scrapers.glassnode import GlassnodeScraper
from src.scrapers.arkham import ArkhamScraper
from src.scrapers.macromicro import MacroMicroScraper
from src.scrapers.forexfactory import ForexFactoryScraper

def load_fixture(name):
    path = os.path.join(os.path.dirname(__file__), 'fixtures', f'{name}.json')
    with open(path, 'r') as f:
        return json.load(f)

def test_defillama_normalization():
    client = DefiLlamaClient()
    raw = load_fixture('defillama')
    records = client.normalize(raw)
    assert len(records) > 0
    assert records[0].payload['metric'] == 'tvl'
    assert records[0].payload['value'] == 50000000000.0

def test_dexscreener_normalization():
    client = DexScreenerClient(["eth/0x123"])
    raw = load_fixture('dexscreener')
    records = client.normalize(raw)
    assert len(records) == 1
    assert records[0].payload['metric'] == 'dex_volume'

def test_fred_normalization():
    client = FredClient(["CPIAUCSL"])
    raw = load_fixture('fred')
    records = client.normalize(raw)
    assert len(records) == 2
    assert records[0].payload['series_id'] == 'CPIAUCSL'

def test_tradingeconomics_normalization():
    client = TradingEconomicsClient()
    raw = load_fixture('tradingeconomics')
    records = client.normalize(raw)
    assert len(records) == 1
    assert records[0].payload['event'] == 'Interest Rate Decision'

def test_coinmarketcap_normalization():
    client = CoinMarketCapClient()
    raw = load_fixture('coinmarketcap')
    records = client.normalize(raw)
    assert len(records) == 1
    assert records[0].payload['symbol'] == 'BTC'

def test_messari_normalization():
    client = MessariClient()
    raw = load_fixture('messari')
    records = client.normalize(raw)
    assert len(records) == 1
    assert records[0].payload['symbol'] == 'BTC'

def test_dune_normalization():
    client = DuneClient("config/dune_queries.yaml")
    raw = load_fixture('dune')
    records = client.normalize(raw)
    assert len(records) == 1
    assert "Active Addresses" in records[0].source

def test_glassnode_normalization():
    client = GlassnodeScraper()
    raw = load_fixture('glassnode')
    records = client.normalize(raw)
    assert records[0].payload['value'] == 450000000000.0

def test_arkham_normalization():
    client = ArkhamScraper("binance")
    raw = load_fixture('arkham')
    records = client.normalize(raw)
    assert records[0].payload['value'] == 15000000000.0

def test_macromicro_normalization():
    client = MacroMicroScraper()
    raw = load_fixture('macromicro')
    records = client.normalize(raw)
    assert len(records) == 2
    assert records[0].payload['value'] == 52.2

def test_forexfactory_normalization():
    client = ForexFactoryScraper()
    raw = load_fixture('forexfactory')
    records = client.normalize(raw)
    assert len(records) == 1
    assert records[0].payload['event'] == 'Non-Farm Employment Change'
