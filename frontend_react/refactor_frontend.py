import os

frontend_dir = os.path.dirname(os.path.abspath(__file__))

def replace_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Replacements for API paths
    content = content.replace("from '../services/api'", "from '../api/api'")
    content = content.replace("from './services/api'", "from './api/api'")
    content = content.replace("from '../../services/api'", "from '../../api/api'")
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

def process_directory(directory):
    for root, _, files in os.walk(directory):
        if 'node_modules' in root or '.git' in root:
            continue
        for file in files:
            if file.endswith('.js') and file != 'refactor_frontend.py':
                replace_in_file(os.path.join(root, file))

if __name__ == '__main__':
    process_directory(frontend_dir)
    print("Frontend API imports refactored.")
