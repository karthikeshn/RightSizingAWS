import os
import glob

backend_dir = os.path.dirname(os.path.abspath(__file__))

def replace_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Replacements
    content = content.replace('from src.db', 'from app.core.database')
    content = content.replace('import src.db', 'import app.core.database')
    content = content.replace('from src.services', 'from app.services')
    content = content.replace('import src.services', 'import app.services')
    content = content.replace('from src.aws_clients', 'from app.services.aws_clients')
    content = content.replace('import src.aws_clients', 'import app.services.aws_clients')
    content = content.replace('from src.llm_clients', 'from app.services.llm_clients')
    content = content.replace('import src.llm_clients', 'import app.services.llm_clients')
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

def process_directory(directory):
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith('.py') and file != 'refactor.py':
                replace_in_file(os.path.join(root, file))

# We will run this after moving files.
if __name__ == '__main__':
    process_directory(backend_dir)
    print("Replacements completed.")
