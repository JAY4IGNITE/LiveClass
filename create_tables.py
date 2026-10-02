import asyncio
from liveclass_api.core.db import get_engine, Base
from liveclass_api.core.models import *

async def main():
    engine = get_engine()
    async with engine.begin() as conn:
        print("Creating all tables in Supabase...")
        await conn.run_sync(Base.metadata.create_all)
        print("Done!")

if __name__ == "__main__":
    asyncio.run(main())
