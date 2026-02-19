import json
import folium


def visualize_all_signals(
    json_file="data/signals_registry.json",
    output_file="all_signals_visualization.html"
):
    print("Loading signal registry...")

    with open(json_file, "r") as f:
        data = json.load(f)

    signals = data["signals"]

    if not signals:
        print("No signals found.")
        return

    # Compute center of all signals
    latitudes = [sig["lat"] for sig in signals.values()]
    longitudes = [sig["lng"] for sig in signals.values()]

    center_lat = sum(latitudes) / len(latitudes)
    center_lng = sum(longitudes) / len(longitudes)

    m = folium.Map(location=[center_lat, center_lng], zoom_start=13)

    print(f"Visualizing {len(signals)} signals...")

    for key, sig in signals.items():
        lat = sig["lat"]
        lng = sig["lng"]
        source = sig.get("source", "unknown")

        # Different color for manual vs osm
        if source == "manual":
            color = "red"
        else:
            color = "blue"

        folium.CircleMarker(
            location=[lat, lng],
            radius=4,
            color=color,
            fill=True,
            fill_opacity=0.8,
            popup=f"{key} ({source})"
        ).add_to(m)

    m.save(output_file)
    print(f"Map saved to {output_file}")


if __name__ == "__main__":
    visualize_all_signals()
