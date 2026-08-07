from flask import Flask
from flask_assets import Bundle, Environment
from .. import app

bundles = {
    'js': Bundle(
        'js/scatterMeta.js',
        'js/graph.js',
        'js/reaction.js',
        'js/script.js',
        output='gen/script.js'
        ),

        'css': Bundle(
        'css/styles.css',
        # 'css/bootstrap.css',
        output='gen/styles.css'
        )
}

assets = Environment(app)

assets.register(bundles)