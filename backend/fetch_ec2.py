import sqlite3
conn = sqlite3.connect('db.sqlite')
c = conn.cursor()
c.execute("SELECT code_content FROM code_repository WHERE service_name='EC2' AND component_type='discovery' ORDER BY version DESC LIMIT 1")
res = c.fetchone()
print(res[0] if res else 'None')
