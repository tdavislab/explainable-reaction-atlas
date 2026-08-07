# Explainable Reaction Atlas

This repository adapts the Reaction Atlas to enable LLM explanations.
**Reference:** [Schwaller et al., 2021](https://doi.org/10.1038/s42256-020-00284-w)

## Installation

First, download the repository to your system. Then run:

```bash
conda create -n rxnmap python=3.9 -y
conda activate rxnmap
conda install -c conda-forge -c tmap tmap
pip install -r requirements.txt
```

## Running application

Download the [dataset](https://drive.google.com/file/d/1QVAbOwMvwff4w0N4g95BThbD_i6ij2V7/view?usp=sharing) and place at `./data/schneiderCanon_w_descs.csv`

You will also need to create a `.env` file at the root directory with the `OPENAI_API_KEY` variable set to the OpenAI API key you use in order to be able to generate explanations.

Then run `python run.py`

The application is then served at `http://127.0.0.1:8080/` and you can open `./tmap/tmap.js` to view the TMAP for the Schneider 50k dataset (deduplicated).

## Generating a TMAP

See instructions in `TMAP_GENERATOR_README.md`.

