from dotenv import load_dotenv
load_dotenv()
from publisher import get_my_shorts_stats

shorts = get_my_shorts_stats(limit=10)
print(f"{'Date':<12} {'Views':>8} {'Likes':>6} {'Dur':>5}  Title")
print("-" * 80)
for s in shorts:
    print(f"{s['published_at'][:10]:<12} {s['views']:>8} {s['likes']:>6} {s['duration']:>4}s  {s['title'][:50]}")
