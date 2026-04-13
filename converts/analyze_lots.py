import pandas as pd
import numpy as np

df_mikro = pd.read_excel(r'C:/Users/STREAM/Desktop/order tracking/converts/mikro.xlsx', header=0)
df_sayim = pd.read_excel(r'C:/Users/STREAM/Desktop/order tracking/converts/mikro sayim.xlsx', header=0)

df_mikro['_key'] = df_mikro['Malzeme Kodu'].astype(str).str.strip()
df_sayim['_key'] = df_sayim['Katolog Numarası'].astype(str).str.strip()

df_mikro = df_mikro[df_mikro['Lot No'] != 'IPTAL']
df_mikro['Gelen_Numeric'] = pd.to_numeric(df_mikro['Gelen Miktar'], errors='coerce').fillna(0)

# Check Bittiği Tarih - if empty, lot may still have stock
df_mikro['is_finished'] = df_mikro['Bittiği Tarih'].notna()

print('Bittiği Tarih analysis:')
finished_count = df_mikro['is_finished'].sum()
active_count = (~df_mikro['is_finished']).sum()
print(f'  Rows with Bittiği Tarih (finished): {finished_count}')
print(f'  Rows without (potentially active): {active_count}')
print()

# For a sample item, show all lots
sample_key = '955134'
sample = df_mikro[df_mikro['_key'] == sample_key][['_key', 'Lot No', 'Gelen Miktar', 'Bittiği Tarih', 'Son Kullanma Tarihi']]
print(f'Sample item {sample_key}:')
print(sample.to_string(index=False))
print()

sayim_row = df_sayim[df_sayim['_key'] == sample_key][' Depo'].values
print(f'Sayim Depo for {sample_key}: {sayim_row}')
print()

# Sum only ACTIVE lots (no Bittiği Tarih) per item
active_lots = df_mikro[~df_mikro['is_finished']]
active_sum = active_lots.groupby('_key')['Gelen_Numeric'].sum().reset_index()
active_sum.columns = ['_key', 'Active_Lots_Sum']

# Compare with sayim
sayim_depo = df_sayim[['_key', ' Depo']].drop_duplicates('_key')
sayim_depo.columns = ['_key', 'Sayim_Depo']

compare = active_sum.merge(sayim_depo, on='_key', how='outer')
compare['Diff'] = compare['Active_Lots_Sum'].fillna(0) - compare['Sayim_Depo'].fillna(0)

print('Comparison: Active lots sum vs Sayim Depo (first 20):')
with_sayim = compare[compare['Sayim_Depo'].notna()].head(20)
print(with_sayim.to_string(index=False))
print()

print(f'Items where Active_Sum == Sayim_Depo: {(compare["Diff"] == 0).sum()}')
print(f'Items where Active_Sum > Sayim_Depo: {(compare["Diff"] > 0).sum()}')
print(f'Items where Active_Sum < Sayim_Depo: {(compare["Diff"] < 0).sum()}')
