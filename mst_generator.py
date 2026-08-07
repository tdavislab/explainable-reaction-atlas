import json
import os
import math
import time

import numpy as np
import pandas as pd
from tqdm import tqdm 
from faerun import Faerun
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
import argparse

from scipy import stats
from rdkit import Chem
from rdkit.Chem import AllChem, Descriptors, Descriptors3D
from matplotlib.colors import LinearSegmentedColormap

import quitefastmst
import networkx as nx
from fa2 import ForceAtlas2


start_time = time.time()
def radial_slice_tree_layout(G, root=None, radius_step=1.0, sort_children=True):
    """
    Radial tree layout where each subtree is confined to the angular slice
    of its parent.

    Parameters
    ----------
    G : networkx.Graph
        Tree or tree-like graph.
    root : node, optional
        Root node. If None, uses an arbitrary node.
    radius_step : float
        Distance between layers.
    sort_children : bool
        If True, children are sorted for deterministic output.

    Returns
    -------
    pos : dict
        {node: (x, y)}
    """
    if root is None:
        root = next(iter(G.nodes))

    # Root the tree
    T = nx.bfs_tree(G, root)
    children = {n: list(T.successors(n)) for n in T.nodes()}

    # Number of leaves in each subtree
    leaf_count = {}

    def count_leaves(n):
        if not children[n]:
            leaf_count[n] = 1
            return 1
        total = sum(count_leaves(c) for c in children[n])
        leaf_count[n] = total
        return total + 1

    count_leaves(root)

    if sort_children:
        for n in children:
            vals = sorted(children[n], key=lambda x: (leaf_count[x], str(x)))
            children[n] = vals[::2] + vals[1::2][::-1]

    # Angles: assign each subtree a contiguous angular interval
    angles = {}

    def assign_angles(n, start_angle, end_angle):
        """
        Put node n at the midpoint of its slice.
        Split the slice among its children proportional to leaf counts.
        """
        angles[n] = (start_angle + end_angle) / 2.0
        if not children[n]:
            return

        span = end_angle - start_angle
        current = start_angle
        for c in children[n]:

            frac = leaf_count[c] / leaf_count[n]
            child_start = current
            child_end = current + span * frac
            assign_angles(c, child_start, child_end)
            current = child_end

    assign_angles(root, 0.0, 2.0 * math.pi)

    # Depths determine radius
    depth = nx.single_source_shortest_path_length(G, root)

    pos = {}
    for n in G.nodes():
        r = depth[n] * radius_step
        a = angles[n]
        pos[n] = (r * math.cos(a), r * math.sin(a))
    return pos

def sfdp_layout(G, init_pos=None, rand_seed=None):
    """
    Compute a Graphviz sfdp layout for a NetworkX graph.

    Notes:
    - sfdp does not use init_pos the same way ForceAtlas2 does.
    - init_pos is stored as node positions if provided, but sfdp still computes
      its own layout.
    """
    A = nx.nx_agraph.to_agraph(G)

    # Good defaults for sparse / tree-like graphs
    A.graph_attr.update(
        overlap="prism",
        overlap_scaling="5",
        K="5",
        repulsiveforce="7.4",
        beautify="true",
    )

    # Optional: Graphviz start setting
    if rand_seed is not None:
        A.graph_attr["start"] = str(rand_seed)

    # Optional: attach initial positions
    if init_pos is not None:
        for n, (x, y) in init_pos.items():
            if A.has_node(n):
                node = A.get_node(n)
                node.attr["pos"] = f"{x},{y}!"

    with tqdm(total=1, desc="Running sfdp layout") as pbar:
        A.layout(prog="sfdp")
        pbar.update(1)

    # Read layout back into a NetworkX-style dict
    pos = {}
    for n in G.nodes():
        node = A.get_node(n)
        x_str, y_str = node.attr["pos"].split(",")[:2]
        pos[n] = (float(x_str), float(y_str))

    return pos

def tree_center(G): # approximates center
    u = next(iter(G.nodes))
    # first BFS: find farthest node
    dist = nx.single_source_shortest_path_length(G, u)
    a = max(dist, key=dist.get)

    # second BFS: diameter endpoint
    dist = nx.single_source_shortest_path_length(G, a)
    b = max(dist, key=dist.get)

    # recover diameter path
    path = nx.shortest_path(G, a, b)

    # middle node(s)
    m = len(path) // 2
    return path[m]

def normalize(pos, new_min=-100, new_max=100):
    """
    Normalize a dict of positions {node: (x, y)} to a given range per axis.
    """

    keys = list(pos.keys())
    x = np.array([pos[k][0] for k in keys])
    y = np.array([pos[k][1] for k in keys])

    def scale_to_range(arr):
        mn, mx = arr.min(), arr.max()
        if mx == mn:
            return np.full_like(arr, (new_min + new_max) / 2)
        return new_min + (arr - mn) * (new_max - new_min) / (mx - mn)

    x_scaled = scale_to_range(x)
    y_scaled = scale_to_range(y)

    # convert back into dictionary
    return {k: (x_scaled[i], y_scaled[i]) for i, k in enumerate(keys)}

def tree_centroid(G, root = None):
    if G.number_of_nodes() == 0:
        raise ValueError("Empty graph")
    if not nx.is_tree(G):
        raise ValueError("tree_centroid expects a tree")

    if root is None:
        root = tree_center(G)

    # Root the tree
    T = nx.bfs_tree(G, root)
    parent = {root: None}
    children = {n: [] for n in T.nodes}

    for u, v in T.edges():
        parent[v] = u
        children[u].append(v)

    n = G.number_of_nodes()
    subtree_size = {}

    def dfs(u):
        size = 1
        for v in children[u]:
            size += dfs(v)
        subtree_size[u] = size
        return size

    dfs(root)

    # Walk toward any child with more than half the nodes
    u = root
    moved = True
    while moved:
        moved = False
        for v in children[u]:
            if subtree_size[v] > n // 2:
                u = v
                moved = True
                break
    return u

parser = argparse.ArgumentParser(description="Generate interactive MST")

parser.add_argument(
    "input",
    type=str,
    help="Input CSV file"
)

parser.add_argument(
    "--output",
    "-o",
    default="",
    help="Output filename"
)

parser.add_argument(
    "--coords",
    choices=["mst", "umap", "tsne", "pca"],
    default="mst",
    help="Coordinate generation method (default: mst)"
)

parser.add_argument(
    "--alg",
    choices=["fast", "scipy"],
    default="fast",
    help="MST generation method (default: fast)"
)

parser.add_argument(
    "--load-mst",
    default="",
    type=str,
    help="Path to .npz that has mst computed already"
)
parser.add_argument(
    "--save-mst",
    type=str,
    default="",
    help="Path to save MST cache file (e.g., ./mst/[name].npz)"
)
rand_seed = 51
args = parser.parse_args()
output_file = args.output if len(args.output) > 0 else args.coords
load_mst = args.load_mst
save_mst = args.save_mst
alg = args.alg

with open('./data/rxnclass2name.json', 'r') as f:
    rxnclass2name = json.load(f)
schneider_df = pd.read_csv(args.input) # was './rxn_data/schneiderCanon_w_descs.csv'
ft_10k_fps = schneider_df.iloc[:, :256].to_numpy(dtype=float)
schneider_df = schneider_df[["Rxn", "Rxn_Class"]]
schneider_df['rxn_category'] = schneider_df.Rxn_Class.apply(lambda x: '.'.join(x.split('.')[:2]))
schneider_df['rxn_superclass'] = schneider_df.Rxn_Class.apply(lambda x: x.split('.')[0])
# print(schneider_df.head().iloc[:, 256:])

# slow

labels = []
# superclasses
superclasses = []
category = []
rclass = []

# product properties
tpsa = []
logp = []
mw = []
h_acceptors = []
h_donors = []
ring_count = []

# metals in precursors
has_Pd = []
has_Li = []
has_Mg = []
has_Al = []
l2norm = np.linalg.norm(ft_10k_fps, axis=1)

for i, row in tqdm(schneider_df.iterrows(), leave=False):

    rxn = row["Rxn"]
    labels.append(
        str(rxn)
        + "__"
        + str(rxn)
        + f"__{l2norm[i]}"
        + f"__{rxnclass2name[row['Rxn_Class']]} - {row['Rxn_Class']}"
        + f"__{rxnclass2name[row['rxn_category']]}"
        + f"__{rxnclass2name[row['rxn_superclass']]}"
    )
    superclasses.append(int(row["rxn_superclass"]))
    category.append(float(row["rxn_category"]))
    rclass.append(row["Rxn_Class"])
    
    precursors, products = rxn.split('>>')

    mol = Chem.MolFromSmiles(products)
            
    tpsa.append(Descriptors.TPSA(mol))
    logp.append(Descriptors.MolLogP(mol))
    mw.append(Descriptors.MolWt(mol))
    h_acceptors.append(Descriptors.NumHAcceptors(mol))
    h_donors.append(Descriptors.NumHDonors(mol))
    ring_count.append(Descriptors.RingCount(mol))
    
    has_Pd.append('Pd' in precursors)
    has_Li.append('Li' in precursors)
    has_Mg.append('Mg' in precursors)
    has_Al.append('Al' in precursors)
tpsa_ranked = stats.rankdata(np.array(tpsa) / max(tpsa)) / len(tpsa)
logp_ranked = stats.rankdata(np.array(logp) / max(logp)) / len(logp)
mw_ranked = stats.rankdata(np.array(mw) / max(mw)) / len(mw)
h_acceptors_ranked = stats.rankdata(np.array(h_acceptors) / max(h_acceptors)) / len(
    h_acceptors
)
h_donors_ranked = stats.rankdata(np.array(h_donors) / max(h_donors)) / len(h_donors)
ring_count_ranked = stats.rankdata(np.array(ring_count) / max(ring_count)) / len(
    ring_count
)

labels_groups, groups = Faerun.create_categories(superclasses)
labels_groups = [(label[0], f"{label[1]} - {rxnclass2name[str(label[1])]}") for label in labels_groups]

ctg_labels, ctg_groups = Faerun.create_categories(category)
ctg_labels = [(label[0], f"{label[1]} - {rxnclass2name[str(label[1])]}") for label in ctg_labels]

class_labels, class_groups = Faerun.create_categories(rclass)
class_labels = [(label[0], f"{label[1]} - {rxnclass2name[str(label[1])]}") for label in class_labels]

if len(load_mst) and os.path.exists(load_mst):
    data = np.load(load_mst)
    s = data["s"]
    t = data["t"]
    mst_dist = data["mst_dist"]
else:
    # produces weights, indexes tuple of edges
    if (alg == "fast"):
        mst_dist, mst_index = quitefastmst.mst_euclid(
            ft_10k_fps,
            M=0,  # euclidean dist
            algorithm="auto",
            verbose=True,
        )

        s = np.array([int(u) for u, v in mst_index], dtype=int)
        t = np.array([int(v) for u, v in mst_index], dtype=int)
    else: # scipy
        with tqdm(total=3, desc=f"Computing MST") as pbar:
            # Do distance matrix
            from scipy.sparse.csgraph import minimum_spanning_tree
            from scipy.spatial.distance import pdist, squareform
            dist_matrix = squareform(pdist(ft_10k_fps, metric="euclidean"))
            pbar.update(1)
            mst_sparse = minimum_spanning_tree(dist_matrix)
            pbar.update(1)
            mst_coo = mst_sparse.tocoo()
            pbar.update(1)

        s = mst_coo.row.astype(int)
        t = mst_coo.col.astype(int)
        mst_dist = mst_coo.data.astype(float)

    if (len(save_mst) > 0):
        np.savez_compressed(
            f"./mst/{save_mst}",
            s=s,
            t=t,
            mst_dist=mst_dist
        )

with tqdm(total=1, desc=f"Computing Coords ({args.coords})", unit="step", leave=False) as pbar:
    # Save to CSV
    if (args.coords == "mst"):
        pbar.total = 4
        G = nx.Graph()
        n = ft_10k_fps.shape[0]
        for i in range(n):
            G.add_node(i)
        print(f"\nedgeLen Range:{mst_dist.min():.4f},{mst_dist.max():.4f}")

        for u, v, w in zip(s, t, mst_dist):
            G.add_edge(int(u), int(v), weight=2.0) # TODO: EXplore weights

        pbar.update(1)

        # Force-directed layout on the tree
        root = tree_center(G)
        root = tree_centroid(G, root)
        
        pbar.update(1)

        # init_pos = nx.nx_agraph.graphviz_layout(G, prog="twopi", root=root)#, args="-Goverlap=false" # very slow, similar result
        pos = radial_slice_tree_layout(G, root=root, radius_step=2.0, sort_children=True)
        # init_pos = radial_tree_equal_leaves(G, root=root, R=10.0) # very bad
        def getCoords(pos):
            x = np.array([pos[i][0] for i in range(n)])
            y = np.array([pos[i][1] for i in range(n)])
            print(
                f"x:({x.min():.4f},{x.max():.4f}) "
                f"y:({y.min():.4f},{y.max():.4f})"
            )
            return x,y

        pbar.update(1)

        getCoords(pos)

        def getFA(scalingRatio=1.0, gravity=0.0, jitter=0.0, theta=1.0):
            gmode = gravity > 0.0
            return ForceAtlas2(outboundAttractionDistribution=False, linLogMode=False,
                adjustSizes=False, edgeWeightInfluence=1.0, barnesHutOptimize=True,
                barnesHutTheta=theta, scalingRatio=scalingRatio, strongGravityMode=gmode,
                gravity=gravity, jitterTolerance=jitter, verbose=True, seed=rand_seed,
                normalizeEdgeWeights=False, invertedEdgeWeightsMode=False,
            )
        fa2 = getFA(scalingRatio=0.001, gravity=0.1, jitter=4.0)
        pos = fa2.forceatlas2_networkx_layout(G, pos=pos, iterations=1000)
        getCoords(pos)
        pos = normalize(pos, new_min = -300, new_max = 300)
        fa2 = getFA(scalingRatio=0.05, gravity=1.5, jitter=0.01)
        pos = fa2.forceatlas2_networkx_layout(G, pos=pos, iterations=1000)
        # pos = sfdp_layout(G, init_pos=init_pos, rand_seed=rand_seed)

        # Get tree coordinates
        x, y = getCoords(pos)

    elif (args.coords == "umap"):
        from umap import UMAP
        reducer = UMAP(n_components=2, random_state=rand_seed)
        coords = reducer.fit_transform(ft_10k_fps)
        x = coords[:, 0]
        y = coords[:, 1]

    elif (args.coords == "tsne"):
        from sklearn.manifold import TSNE
        tsne = TSNE(n_components=2, random_state=rand_seed)
        coords = tsne.fit_transform(ft_10k_fps)
        x = coords[:, 0]
        y = coords[:, 1]

    elif (args.coords == "pca"):
        from sklearn.decomposition import PCA
        coords = PCA(n_components=2).fit_transform(ft_10k_fps)
        x = coords[:, 0]
        y = coords[:, 1]
    
    result_df = pd.DataFrame({
        "x": x,
        "y": y
    })
    result_df.to_csv(f"./mst/{args.coords}_coords.csv", index=False)
    pbar.update(1)

# Define colormaps
set1 = plt.get_cmap("Set1").colors
rainbow = plt.get_cmap("rainbow")
colors = rainbow(np.linspace(0, 1, len(set(groups))))[:, :3].tolist()
colors = [(31,119,180), (44, 160, 44), (214, 39, 40), (148, 103, 189), (140, 86, 75), (227, 119, 194), (127, 127, 127), (188, 189, 34), (255, 127, 14)]
colors = [[r/255.0, g/255.0, b/255.0] for r, g, b in colors]
custom_cm = LinearSegmentedColormap.from_list("my_map", colors, N=len(colors))
colors = rainbow(np.linspace(0, 1, len(set(ctg_groups))))[:, :3].tolist()
ctg_cm = LinearSegmentedColormap.from_list("my_map", colors, N=len(colors))
colors = rainbow(np.linspace(0, 1, len(set(class_groups))))[:, :3].tolist()
class_cm = LinearSegmentedColormap.from_list("my_map", colors, N=len(colors))
bin_cmap = ListedColormap([set1[8], "#5400F6"], name="bin_cmap")

print("Plotting with Faerun")
# slow
f = Faerun(clear_color="#ffffff", coords=False, view="front",)
    
f.add_scatter(
    "ReactionAtlas",
    {
        "x": x, "y": y, 
        "c": [
            groups, # superclasses
            ctg_groups,
            class_groups,
            l2norm,
            has_Pd, 
            has_Li, 
            has_Mg, 
            has_Al,
            tpsa_ranked,
            logp_ranked,
            mw_ranked,
            h_acceptors_ranked,
            h_donors_ranked,
            ring_count_ranked,
        ], 
        "labels": labels
    },
    shader="smoothCircle",
    colormap=[
        custom_cm, 
        ctg_cm,
        class_cm,
        "rainbow",
        bin_cmap, 
        bin_cmap, 
        bin_cmap, 
        bin_cmap, 
        "rainbow",
        "rainbow",
        "rainbow",
        "rainbow",
        "rainbow",
        "rainbow",

    ],
    point_scale=2.0,
    categorical=[
        True,
        True,
        True,
        False, 
        True, 
        True, 
        True, 
        True, 
        False, 
        False, 
        False, 
        False, 
        False, 
        False, 
    ],
    has_legend=True,
    legend_labels=[
        labels_groups,
        ctg_labels,
        class_labels,
        None,
        [(0, "No"), (1, "Yes")],
        [(0, "No"), (1, "Yes")],
        [(0, "No"), (1, "Yes")],
        [(0, "No"), (1, "Yes")],
        None,
        None,
        None,
        None,
        None,
        None,
    ],
    selected_labels=["SMILES", "SMILES", "L2norm",  "Named Reaction", "Category", "Superclass"],
    series_title=[
        "Superclass", 
        "Category",
        "Class",
        "L2norm",
        "Pd", 
        "Li", 
        "Mg", 
        "Al",
        "TPSA",
        "logP",
        "Mol Weight",
        "H Acceptors",
        "H Donors",
        "Ring Count",
    ],
    max_legend_label=[
        None,
        None,
        None,
        str(round(max(l2norm))),
        None,
        None,
        None,
        None,
        str(round(max(tpsa))),
        str(round(max(logp))),
        str(round(max(mw))),
        str(round(max(h_acceptors))),
        str(round(max(h_donors))),
        str(round(max(ring_count))),
    ],
    min_legend_label=[
        None,
        None,
        None,
        str(round(min(l2norm))),
        None,
        None,
        None,
        None,
        str(round(min(tpsa))),
        str(round(min(logp))),
        str(round(min(mw))),
        str(round(min(h_acceptors))),
        str(round(min(h_donors))),
        str(round(min(ring_count))),
    ],
    title_index=2,
    legend_title="",
)

f.add_tree("reactiontree", {"from": s, "to": t}, point_helper="ReactionAtlas")

plot = f.plot(output_file, template="reaction_smiles")

# print("Replacing broken smiles drawer script")
# Replace broken smiles script
file_path = f"{output_file}.html"

old = '<script src="https://unpkg.com/smiles-drawer@2.1.7/dist/smiles-drawer.min.js"></script>'
# with open('./tmap/smilesDrawer_override.txt', "r", encoding="utf-8") as f:
#     new = f.read()
with open(file_path, "r", encoding="utf-8") as f:
    html = f.read()
new = '<script src="https://unpkg.com/smiles-drawer@2.0.1/dist/smiles-drawer.min.js"></script>'
html = html.replace(old, new)

# Write updated HTML
with open(file_path, "w", encoding="utf-8") as f:
    f.write(html)

# Add mapping of node indexes to all edge indexes in 2d array [[edge indexes of node 1],[for node 2]...]
incident_edges = [[] for i in range(2*len(s))]
index = 0
for i in tqdm(range(len(s)), desc="Mapping nodes to edges", leave=False):
    coord = s[i]
    incident_edges[coord].append(index)
    index += 1

    coord = t[i]
    incident_edges[coord].append(index)
    index += 1

pbar.set_description("")
pbar.update()
# Also add neighbor indexes in 2d array [[node 1 neighbors], ...]
neighbors = [[] for i in range(len(x))]
for i in tqdm(range(len(s)), desc="Constructing edge list", leave=False):
    neighbors[int(s[i])].append(int(t[i]))
    neighbors[int(t[i])].append(int(s[i]))

pbar.set_description("Writing to file")
pbar.update()

file_path = f"{output_file}.js"
with open(file_path, "r+b") as f:
    content = f.read()

    # remove only the last occurrence of "};"
    idx = content.rfind(b"};")
    if idx == -1:
        raise ValueError("Could not find closing '};'")    
    f.seek(idx)

    incident_edges = json.dumps(incident_edges, separators=(",",":")).encode()
    neighbors = json.dumps(neighbors, separators=(",",":")).encode()
    edge_weights = json.dumps(mst_dist.tolist(), separators=(",",":")).encode()
    new_end = (
        b"incident_edges:" + incident_edges + b",\n"
        b"neighbors:" + neighbors  + b",\n"
        b"edge_weights:" + edge_weights + b"\n};")
    f.write(new_end)
    f.truncate()
    

pbar.update()
print(f"Elapsed time: {time.time() - start_time:.2f} seconds")