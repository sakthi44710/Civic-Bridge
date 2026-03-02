"""Web Search Agent Service — Real-time scholarship & scheme discovery via DuckDuckGo

Searches the web for Indian government scholarships, schemes, and welfare
programs. Returns structured results that the AI can use to give detailed,
up-to-date responses instead of relying on a hardcoded list.
"""

import asyncio
import logging
from typing import Dict, List, Optional
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

# Thread pool for running sync DuckDuckGo searches in async context
_executor = ThreadPoolExecutor(max_workers=3)

# Try importing duckduckgo_search
try:
    from duckduckgo_search import DDGS
    DDGS_AVAILABLE = True
except ImportError:
    DDGS_AVAILABLE = False
    logger.warning("duckduckgo-search not installed — web search unavailable")


class WebSearchService:
    """Searches the web for government schemes, scholarships, and welfare info."""

    def __init__(self):
        self.cache: Dict[str, dict] = {}  # simple in-memory cache

    def _search_sync(self, query: str, max_results: int = 10) -> List[Dict]:
        """Run a DuckDuckGo text search (synchronous)."""
        if not DDGS_AVAILABLE:
            return []
        try:
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=max_results, region="in-en"))
            return results
        except Exception as e:
            logger.warning(f"DuckDuckGo search failed for '{query}': {e}")
            return []

    async def search(self, query: str, max_results: int = 10) -> List[Dict]:
        """Async wrapper for DuckDuckGo search."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            _executor, self._search_sync, query, max_results
        )

    async def search_scholarships(
        self, user_context: str = "", category: str = "scholarship", count: int = 20
    ) -> Dict:
        """
        Search for Indian government scholarships/schemes.
        
        Args:
            user_context: Additional context from user (e.g. "engineering student OBC")
            category: Type of scheme to search (scholarship, healthcare, pension, etc.)
            count: Number of results to fetch
            
        Returns:
            Dict with search_results, summary, and query used.
        """
        # Build targeted search queries
        queries = self._build_queries(user_context, category)

        all_results = []
        seen_urls = set()

        # Run multiple searches in parallel for comprehensive results
        tasks = [self.search(q, max_results=count) for q in queries]
        search_outputs = await asyncio.gather(*tasks, return_exceptions=True)

        for output in search_outputs:
            if isinstance(output, Exception):
                logger.warning(f"Search task failed: {output}")
                continue
            for result in output:
                url = result.get("href", "")
                if url and url not in seen_urls:
                    seen_urls.add(url)
                    all_results.append({
                        "title": result.get("title", ""),
                        "snippet": result.get("body", ""),
                        "url": url,
                    })

        # Deduplicate and limit
        all_results = all_results[:count]

        return {
            "query": " | ".join(queries),
            "total_results": len(all_results),
            "results": all_results,
        }

    def _build_queries(self, user_context: str, category: str) -> List[str]:
        """Build search queries based on category and user context."""
        base = user_context.strip()

        query_map = {
            "scholarship": [
                f"top Indian government scholarships 2025 2026 {base}".strip(),
                f"India scholarship scheme eligibility apply {base}".strip(),
            ],
            "education": [
                f"Indian government education scholarship students {base}".strip(),
                f"NSP scholarship PM scholarship India {base}".strip(),
            ],
            "healthcare": [
                f"Indian government health scheme Ayushman Bharat {base}".strip(),
                f"free healthcare scheme India eligibility {base}".strip(),
            ],
            "pension": [
                f"Indian government pension scheme old age widow {base}".strip(),
                f"PM Shram Yogi pension eligibility India {base}".strip(),
            ],
            "agriculture": [
                f"Indian government farmer scheme PM KISAN {base}".strip(),
                f"crop insurance agriculture scheme India {base}".strip(),
            ],
            "housing": [
                f"PM Awas Yojana housing scheme India {base}".strip(),
                f"government housing subsidy scheme India {base}".strip(),
            ],
            "general": [
                f"Indian government welfare scheme {base}".strip(),
                f"government scheme eligibility India {base}".strip(),
            ],
        }

        return query_map.get(category, query_map["general"])

    async def search_scheme_details(self, scheme_name: str) -> Dict:
        """Search for details about a specific scheme."""
        results = await self.search(
            f"{scheme_name} India government scheme eligibility documents apply",
            max_results=5,
        )

        return {
            "scheme_name": scheme_name,
            "total_results": len(results),
            "results": [
                {
                    "title": r.get("title", ""),
                    "snippet": r.get("body", ""),
                    "url": r.get("href", ""),
                }
                for r in results
            ],
        }

    def format_results_for_ai(self, search_data: Dict) -> str:
        """
        Format search results into a context string that can be injected
        into the AI prompt so it can generate informed responses.
        """
        results = search_data.get("results", [])
        if not results:
            return "(No web search results available)"

        lines = [f"Web search found {len(results)} results:\n"]
        for i, r in enumerate(results, 1):
            title = r.get("title", "Unknown")
            snippet = r.get("snippet", "")
            url = r.get("url", "")
            lines.append(f"{i}. **{title}**")
            if snippet:
                lines.append(f"   {snippet}")
            if url:
                lines.append(f"   Source: {url}")
            lines.append("")

        return "\n".join(lines)


# Singleton
web_search_service = WebSearchService()
