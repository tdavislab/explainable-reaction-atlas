from flask import render_template,request, url_for, jsonify, redirect, Response, send_from_directory
from app import app, gen_explanation, APP_STATIC, APP_ROOT

import re
import json
import random
import pandas as pd
import numpy as np

@app.route('/')
def index():
    return render_template('tmap.html')

@app.route('/data_process', methods=['POST','GET'])
def process_text_data():
    # receives js text
    text = request.get_data().decode('utf-8')
    # remove start
    text = text.replace("const data = ", "", 1)
    text = re.sub(r';\s*$', '', text)

    # 1. Fix invalid escape sequences
    text = re.sub(r'\\(?!["\\/bfnrtu])', r'\\\\', text)

    # 2. Remove comments
    text = re.sub(r'//.*', '', text)
    text = re.sub(r'/\*[\s\S]*?\*/', '', text)

    # 3. Backticks → quotes
    text = re.sub(r'`([^`]*)`', r'"\1"', text)

    # 4. Single → double quotes
    text = re.sub(r"'", '"', text)

    # 5. Quote keys
    text = re.sub(r'([,{]\s*)([A-Za-z0-9_]+)\s*:', r'\1"\2":', text)

    # 6. Remove trailing commas
    text = re.sub(r',\s*}', '}', text)
    text = re.sub(r',\s*]', ']', text)


    data = json.loads(text)

    return jsonify(data)

@app.route('/explain_neighborhoods', methods=['POST','GET'])
def get_explain_neighborhoods():
    data = request.get_json()
    vertices = data.get("vertices", [])
    prompt = data.get("prompt", "")
    model = data.get("model", "")
    include_labels = data.get("include_labels", False)

    if (len(prompt) == 0):
        return jsonify({
            "keywords": ["NA"],
            "summary": "No Summary"
        })
    prompt += """Summarize in under 50 words and list 3 descriptors.
        Provide your response strictly in the following JSON format: 
        {
        "keywords": string[], // array of 3 key descriptors
        "summary": string // summary of the common patterns
        }"""
    if (len(vertices) == 2):
        arr1 = vertices[0]
        arr2 = vertices[1]
        set1 = set(arr1)
        set2 = set(arr2)

        overlap = list(set1 & set2)
        unique1 = list(set1 - set2)
        unique2 = list(set2 - set1)

        overlap = random.sample(overlap,min(200,len(overlap)))
        group_sizes = 200 if len(overlap) > 0 else 300
        unique1 = random.sample(unique1,min(group_sizes,len(unique1)))
        unique2 = random.sample(unique2,min(group_sizes,len(unique2)))
        resp = gen_explanation.compare_neighborhoods([overlap, unique1, unique2], prompt, model, include_labels)
        return jsonify(resp)
    elif (len(vertices) == 1):
        vertices = vertices[0]
        vertices = random.sample(vertices,min(600,len(vertices)))
        resp = gen_explanation.summarize_neighborhood(vertices, prompt, model, include_labels)
        return jsonify(resp)
    else:
        return jsonify({
            "keywords": ["NA"],
            "summary": "Must have vertices array [[neighborhood1],[neighborhood2 (optional)]]"
        })
    

@app.route('/explain_paths', methods=['POST','GET'])
def get_explain_paths():
    data = request.get_json()
    vertices = data.get("vertices", [])
    prompt = data.get("prompt", "")
    model = data.get("model", "")
    include_labels = data.get("include_labels", False)
    if (len(prompt) == 0):
        return jsonify({
            "keywords": ["NA"],
            "summary": "No Summary"
        })
    elif len(vertices) > 2:
        return jsonify({
            "keywords": ["NA"],
            "summary": "Must have vertices array [[Path1],[Path2 (optional)]]"
        })
    if len(vertices) == 1:
        vertices[0] = sample_with_endpoints(vertices[0], k=600)
    else:
        vertices[0] = sample_with_endpoints(vertices[0], k=300)
        vertices[1] = sample_with_endpoints(vertices[1], k=300)
    prompt += """Summarize in under 50 words and list 3 descriptors.
        Provide your response strictly in the following JSON format: 
        {
        "keywords": string[], // array of 3 key descriptors
        "summary": string // summary of the common patterns
        }"""
    resp = gen_explanation.explain_paths(vertices, prompt, model, include_labels)
    return jsonify(resp)

@app.route('/hd_neighbors', methods = ['POST','GET'])
def get_hd_neighborhood():
    data = request.get_json()
    index = data.get("index", -1)
    eps = data.get("eps", 0)
    schneider_df = pd.read_csv("./data/schneiderCanon_w_descs.csv")
    # first 256 columns
    X = schneider_df.iloc[:, :256].to_numpy(dtype=float)
    # target row
    x0 = X[index]
    # Euclidean distances to all rows
    distances = np.linalg.norm(X - x0, axis=1)

    # all row indexes within epsilon distance
    within_eps = np.where((distances <= eps))[0].tolist()

    return jsonify({"neighbors": within_eps})

def sample_with_endpoints(arr, k=600):
    n = len(arr)
    
    if n <= k:
        return arr[:]  # nothing to sample
    
    # Number of middle points to sample
    middle_k = k - 2
    
    # Sample indices from the middle (exclude first and last)
    middle_indices = sorted(random.sample(range(1, n - 1), middle_k))
    
    # Construct final result
    result = [arr[0]] + [arr[i] for i in middle_indices] + [arr[-1]]
    
    return result