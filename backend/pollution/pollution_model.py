import requests
import datetime
import pandas as pd

API_KEY = "Your API key here"

LAT = 22.7196   # Indore latitude
LON = 75.8577   # Indore longitude

url = "https://api.airvisual.com/v2/history"

end_date = datetime.datetime.utcnow()
start_date = end_date - datetime.timedelta(days=30)

params = {
    "lat": LAT,
    "lon": LON,
    "start": start_date.strftime("%Y-%m-%d"),
    "end": end_date.strftime("%Y-%m-%d"),
    "key": API_KEY
}

response = requests.get(url, params=params)

if response.status_code == 200:
    data = response.json()
    pollution = data.get("data", {}).get("pollution", [])
    
    df = pd.DataFrame(pollution)
    df["ts"]