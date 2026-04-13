import pandas as pd
import numpy as np

df_mikro = pd.read_excel(r'C:/Users/STREAM/Desktop/order tracking/converts/mikro.xlsx', header=0)
df_sayim = pd.read_excel(r'C:/Users/STREAM/Desktop/order tracking/converts/mikro sayim.xlsx', header=0)

df_mikro['_key'] = df_mikro['Malzeme Kodu'].astype(str).str.strip()
df_sayim['_key'] = df_sayim['Katolog Numarası'].astype(str).str.strip()

# Filter out IPTAL
df_mikro = df_mikro[df_mikro['Lot No'] != 'IPTAL']
df_mikro['Gelen_Numeric'] = pd.to_numeric(df_mikro['Gelen Miktar'], errors='coerce').fillna(0)

# Convert dates
df_mikro['Bittiği Tarih'] = pd.to_datetime(df_mikro['Bittiği Tarih'], errors='coerce')
df_mikro['Son Kullanma Tarihi'] = pd.to_datetime(df_mikro['Son Kullanma Tarihi'], errors='coerce')

# Group by (item, lot) - sum Gelen Miktar, take latest Bittiği Tarih
lot_agg = df_mikro.groupby(['_key', 'Lot No']).agg({
    'Gelen_Numeric': 'sum',
    'Bittiği Tarih': 'max',  # if any row has finish date, lot is finished
    'Son Kullanma Tarihi': 'max',
    'Dağıtımcı Firma': 'first',
}).reset_index()

lot_agg.columns = ['_key', 'Lot_No', 'Total_Received', 'Finished_Date', 'Expiry', 'Supplier']
lot_agg['is_active'] = lot_agg['Finished_Date'].isna()

print(f"Unique lots: {len(lot_agg)}")
print(f"  Active (no Bittiği Tarih): {lot_agg['is_active'].sum()}")
print(f"  Finished: {(~lot_agg['is_active']).sum()}")
print()

# For each item: sum Total_Received of ACTIVE lots only
active_lots = lot_agg[lot_agg['is_active']]
active_sum_per_item = active_lots.groupby('_key')['Total_Received'].sum().reset_index()
active_sum_per_item.columns = ['_key', 'Active_Lots_Total']

# Compare with sayim Depo
sayim_depo = df_sayim[['_key', ' Depo']].drop_duplicates('_key')
sayim_depo.columns = ['_key', 'Sayim_Depo']

compare = active_sum_per_item.merge(sayim_depo, on='_key', how='outer')
compare['Diff'] = compare['Active_Lots_Total'].fillna(0) - compare['Sayim_Depo'].fillna(0)

print("Comparison: Sum of active lots' Total_Received vs Sayim Depo")
print("(If Diff=0, the active lots' received qty matches current stock)")
print()

with_sayim = compare[compare['Sayim_Depo'].notna()].sort_values('_key')
print(with_sayim.head(30).to_string(index=False))
print()

exact_match = (compare['Diff'] == 0).sum()
close_match = (compare['Diff'].abs() <= 2).sum()
print(f"Exact matches (Diff=0): {exact_match}")
print(f"Close matches (|Diff|<=2): {close_match}")
print(f"Total items with sayim: {compare['Sayim_Depo'].notna().sum()}")
print()

# Show sample item detail
sample_key = '955134'
print(f"Detail for item {sample_key}:")
item_lots = lot_agg[lot_agg['_key'] == sample_key]
print(item_lots.to_string(index=False))
print(f"Sayim Depo: {df_sayim[df_sayim['_key'] == sample_key][' Depo'].values}")
