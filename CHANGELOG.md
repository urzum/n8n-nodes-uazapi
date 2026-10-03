# Changelog

## 0.1.0

- Credencial **Uazapi API** (Server URL + Admin Token opcional).
- Node **Uazapi**: Message (Send Text, Send Media, Send Contact, Send Location, Send Menu, React, Mark as Read, Send Presence) e Instance (Get Status, Connect, Disconnect). Seletor de instância por lista ou token. `track_source` padrão `automa_uazapi`.
- Node **Uazapi Trigger**: webhook próprio (`add`/`delete`), troca ao mudar eventos, descarte por token e por `track_source`, saída normalizada (`user`/`assistant`/`human`) ou bruta, download de mídia e transcrição de áudio.
