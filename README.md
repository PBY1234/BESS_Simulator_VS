# OMIE Data Parser

This project parses OMIE (Spanish electricity market) data files to generate a JSON file suitable for upload to Vercel for a simulator.

## Prerequisites

- Node.js installed (download from https://nodejs.org/)

## Data Files

- Place `marginalpdbc_YYYYMMDD.1` files in `c:\Users\PabloBorras\Downloads\Omie2025`
- Place `curva_pbc_YYYYMMDD.1` files in `c:\Users\PabloBorras\Downloads\OmieDemand2025`

## Usage

Run the script:

```bash
node parse.js
```

This will generate `omie_data.json` with the parsed data.

## Output Format

The JSON contains:

- `prices`: Hourly average prices for each day.
- `curves`: Supply and demand curves for each hour of each day, thinned to max 50 points.

Upload `omie_data.json` to Vercel for your simulator.