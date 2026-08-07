# Reaction Map Generator

The `tmap_generator.py` file generates **2D coordinates of TMAP** from descriptor vectors and exports them for visualization (e.g., with **TMAP / Faerun**).

The script supports multiple dimensionality-reduction methods to use as coordinates:

* **TMAP** (Tree map, force directed)
* **UMAP**
* **t-SNE**
* **PCA**

---

# 1. Create the Conda Environment

It is recommended to use **conda-forge** for most scientific packages.

### Create environment

```bash
conda create -n rxnmap python=3.9 -y
conda activate rxnmap
```

### Install dependencies

```bash
conda install -c conda-forge -c tmap tmap
pip install -r requirements.txt
```

# 2. Input Data Format

The input file should be a **CSV file containing reaction descriptors**.

Example structure:

```
d1,d2,d3,...,d256, Rxn, Rxn_Class
0.23,0.11,...,0.1, string, string
0.18,0.09,...,0.2, string, string
```

Requirements:

* Column **`Rxn`** contains reaction SMILES
* Column **`Rxn_Class`** contains reaction class (e.g. 6.3.1)
* First **256 descriptor columns** are used for coordinate generation

---

# 3. Running the Script

Basic usage:

```bash
python tmap_generator.py input.csv
```

This will:

* Generate **TMAP coordinates**
* Save output to a default CSV file.

---

# 4. Command Line Arguments

## Required argument

### `input`

Input CSV file containing reaction descriptors.

Example:

```
python tmap_generator.py reactions.csv
```

---

## Optional arguments

### `--output`

Specify the output file name.

Example:

```bash
python tmap_generator.py reactions.csv --output ./tmap/outputname
```

Output format:

```
Rxn,x,y
CCO>>CC=O,-12.3,4.5
CCC>>CC=C,-10.1,5.2
```

---

### `--coords`

Select the dimensionality-reduction method.

Options:

```
tmap
umap
tsne
pca
```

Default:

```
tmap
```

Examples:

#### UMAP

```bash
python tmap_generator.py reactions.csv --coords umap
```

#### t-SNE

```bash
python tmap_generator.py reactions.csv --coords tsne
```

#### PCA

```bash
python tmap_generator.py reactions.csv --coords pca
```

---

# 5. Example Commands

### Generate TMAP map

```bash
python tmap_generator.py reactions.csv --output tmap_coords.csv
```

### Generate UMAP map

```bash
python tmap_generator.py reactions.csv --coords umap --output umap_coords.csv
```

### Generate t-SNE map

```bash
python tmap_generator.py reactions.csv --coords tsne --output tsne_coords.csv
```

### Generate PCA map

```bash
python tmap_generator.py reactions.csv --coords pca --output pca_coords.csv
```

---

# 6. Output

The script generates a CSV file containing:

```
Rxn,x,y
```

Where:

* **Rxn** = reaction SMILES
* **x,y** = 2D coordinates from the chosen method

These coordinates can be used for:

* **Faerun interactive maps**
* **matplotlib visualizations**
* **chemical space exploration**

---

# 7. Troubleshooting

### `PackagesNotFoundError: umap`

Install using:

```
conda install -c conda-forge umap-learn
```

---

### TMAP dependency issues

Ensure both channels are used:

```
-c conda-forge -c tmap
```

---

### Environment conflicts

Recreate environment:

```
conda remove -n rxnmap --all
conda create -n rxnmap python=3.9
```

---

# 8. Recommended Workflow

```
1. Prepare descriptor CSV
2. Create conda environment
3. Run coordinate generation
4. Visualize coordinates
```

---

# 9. Example Project Structure

```
project/
│
├── tmap_generator.py
├── README.md
├── data/
│   └── reactions.csv
└── output/
    └── coords.csv
```

---
