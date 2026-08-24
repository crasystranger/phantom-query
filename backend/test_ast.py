import sqlglot
from sqlglot import parse_one, exp

q = parse_one("SELECT current_setting('is_superuser')", read="postgres")
print(q)
print(repr(q.args))
print([str(t) for t in q.find_all(exp.Table)])