import asyncio
import json
import os
import sys

import edge_tts

jobs_path = sys.argv[1]
with open(jobs_path, "r", encoding="utf-8") as handle:
    jobs = json.load(handle)

semaphore = asyncio.Semaphore(8)


async def one(job):
    async with semaphore:
        os.makedirs(os.path.dirname(job["out"]), exist_ok=True)
        if os.path.exists(job["out"]) and os.path.getsize(job["out"]) > 500:
            return
        for attempt in range(3):
            try:
                communicate = edge_tts.Communicate(job["text"], job["voice"], rate="-6%")
                await communicate.save(job["out"])
                return
            except Exception as error:  # noqa: BLE001
                if attempt == 2:
                    print("FAILED", job["out"], error)
                await asyncio.sleep(1 + attempt)


async def main():
    await asyncio.gather(*(one(job) for job in jobs))
    print(f"voice: {len(jobs)} clips ready")


asyncio.run(main())
