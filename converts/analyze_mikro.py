import pandas as pd
import numpy as np

df_mikro = pd.read_excel(r'C:/Users/STREAM/Desktop/order tracking/converts/mikro.xlsx', header=0)
df_sayim = pd.read_excel(r'C:/Users/STREAM/Desktop/order tracking/converts/mikro sayim.xlsx', header=0)

# Normalize keys
df_mikro['_key'] = df_mikro['Malzeme Kodu'].astype(str).str.strip()
df_sayim['_key'] = df_sayim['Katolog Numarası'].astype(str).str.strip()

# Filter out IPTAL lots
df_mikro = df_mikro[df_mikro['Lot No'] != 'IPTAL']

# Convert Gelen Miktar to numeric (coerce errors to NaN)
df_mikro['Gelen_Numeric'] = pd.to_numeric(df_mikro['Gelen Miktar'], errors='coerce')

print("Gelen Miktar column info:")
print(f"  Total rows: {len(df_mikro)}")
print(f"  Numeric values: {df_mikro['Gelen_Numeric'].notna().sum()}")
print(f"  Non-numeric values: {df_mikro['Gelen_Numeric'].isna().sum()}")
print()

# Show non-numeric values
non_numeric = df_mikro[df_mikro['Gelen_Numeric'].isna()]['Gelen Miktar'].unique()
print(f"Non-numeric Gelen Miktar values: {non_numeric[:10]}")
print()

# Sum Gelen Miktar per item from mikro
mikro_sum = df_mikro.groupby('_key')['Gelen_Numeric'].sum().reset_index()
mikro_sum.columns = ['_key', 'Mikro_Total_Gelen']

# Get Depo from sayim
sayim_depo = df_sayim[['_key', ' Depo']].drop_duplicates('_key')
sayim_depo.columns = ['_key', 'Sayim_Depo']

# Merge and compare
compare = mikro_sum.merge(sayim_depo, on='_key', how='outer')
compare['Diff'] = compare['Mikro_Total_Gelen'].fillna(0) - compare['Sayim_Depo'].fillna(0)

print("Sample comparison (first 20 items with sayim data):")
with_sayim = compare[compare['Sayim_Depo'].notna()].head(20)
print(with_sayim.to_string(index=False))
print()

print(f"Total items in comparison: {len(compare)}")
print(f"Items with sayim data: {compare['Sayim_Depo'].notna().sum()}")
print(f"Items where Mikro_Total == Sayim_Depo: {(compare['Diff'] == 0).sum()}")
print(f"Items where Mikro_Total > Sayim_Depo (consumed): {(compare['Diff'] > 0).sum()}")
print(f"Items where Mikro_Total < Sayim_Depo: {(compare['Diff'] < 0).sum()}")
print()

# The difference = consumed quantity
# Mikro_Total_Gelen = total received over time
# Sayim_Depo = current stock
# Consumed = Mikro_Total_Gelen - Sayim_Depo

print("Interpretation:")
print("  Mikro_Total_Gelen = total quantity received (all orders)")
print("  Sayim_Depo = current stock in warehouse")
print("  Diff = consumed quantity (received - current)")
