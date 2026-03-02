"""
Seed Script - Load scheme data into DynamoDB
"""
import json
import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.scheme_service import scheme_service


def seed_schemes():
    """Load all scheme JSON files into DynamoDB"""
    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
    
    categories = ["education", "healthcare", "agriculture", "welfare"]
    total = 0
    
    for category in categories:
        filepath = os.path.join(data_dir, f"schemes_{category}.json")
        if not os.path.exists(filepath):
            print(f"Warning: {filepath} not found")
            continue
        
        with open(filepath, "r", encoding="utf-8") as f:
            schemes = json.load(f)
        
        scheme_service.seed_schemes(schemes)
        total += len(schemes)
        print(f"Loaded {len(schemes)} {category} schemes")
    
    print(f"\nTotal: {total} schemes seeded successfully")


if __name__ == "__main__":
    seed_schemes()
