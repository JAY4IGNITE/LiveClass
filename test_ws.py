import asyncio
import json
import uuid

import httpx
import websockets


async def test():
    # 1. Login
    async with httpx.AsyncClient() as client:
        res = await client.post(
            "http://127.0.0.1:8000/auth/login",
            json={"username": "teacher1@example.com", "password": "password123"},
        )
        if res.status_code != 200:
            print("Login failed:", res.text)
            return
        token = res.json()["access_token"]
        print("Logged in")

        # 2. Create session
        res = await client.post(
            "http://127.0.0.1:8000/sessions", headers={"Authorization": f"Bearer {token}"}
        )
        if res.status_code != 200:
            print("Create session failed:", res.text)
            return
        session_id = res.json()["id"]
        print("Created session:", session_id)

    # 3. Connect websocket
    async with websockets.connect("ws://127.0.0.1:8000/ws") as ws:
        # connect
        await ws.send(
            json.dumps(
                {
                    "protocol": "1.0",
                    "type": "connect",
                    "msgId": str(uuid.uuid4()),
                    "ts": 123456,
                    "token": token,
                    "clientInfo": {"ideType": "vscode", "clientVersion": "1.0"},
                }
            )
        )
        ack = await ws.recv()
        print("Connect ack:", ack)

        # join
        await ws.send(
            json.dumps(
                {
                    "protocol": "1.0",
                    "type": "join",
                    "msgId": str(uuid.uuid4()),
                    "ts": 123456,
                    "sessionId": session_id,
                    "resume": [],
                }
            )
        )
        welcome = await ws.recv()
        print("Welcome:", welcome)


asyncio.run(test())
