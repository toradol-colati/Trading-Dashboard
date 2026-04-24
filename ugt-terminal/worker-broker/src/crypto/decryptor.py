import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

class Decryptor:
    def __init__(self, kek_path: str = None):
        self.kek_path = kek_path or os.getenv("KEK_PATH", "/run/secrets/kek.bin")
        self._kek = None

    def _get_kek(self) -> bytes:
        if self._kek is None:
            with open(self.kek_path, "rb") as f:
                self._kek = f.read()
        return self._kek

    def decrypt(self, ciphertext: bytes, nonce: bytes, tag: bytes) -> str:
        kek = self._get_kek()
        aesgcm = AESGCM(kek)
        # Combined ciphertext + tag as cryptography expects
        data = ciphertext + tag
        decrypted = aesgcm.decrypt(nonce, data, None)
        return decrypted.decode("utf-8")
