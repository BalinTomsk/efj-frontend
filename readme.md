https://support.google.com/webmasters/answer/6340290?hl=ru



fishfind-frontend



I. Water Data State

&#x20;1. pushall.cmd  Canada water data   -- call wget --no-cache --spider -q "http://fishfind.info/WebService/PushStation.aspx?mli=%1\&state=%2"



&#x20;1a.  string url = String.Format(@"http://dd.weather.gc.ca/hydrometric/csv/{0}/hourly/{0}\_{1}\_hourly\_hydrometric.csv", state, mli);  // ON\_02AB006\_hourly\_hydrometric.csv

&#x20;1b.  return csv list

&#x20;1c.  process csv in ONWaterData(List<string\[]> data)           // ID,     Date,        

&#x20;     Water Level / Niveau d'eau (m), Grade, Symbol / Symbole,QA/QC,Discharge / Débit        (cms),Grade,Symbol / Symbole,QA/QC

&#x20;     02AB006,2018-07-01T00:55:00-05:00,302.273,,,1                                                ,62.2,,,1

&#x20;1d.  Merge Into dbo.WaterData

&#x20;     



&#x20;2. pushUSall.cmd   -- call wget --no-cache --spider -q "http://fishfind.info/WebService/PushStationUS.aspx?mli=%1\&state=%2"

&#x20;2a.   String.Format(@"https://waterservices.usgs.gov/nwis/iv/?sites={0}\&period=P3D\&format=waterml", mli);  // ON\_02AB006\_hourly\_hydrometric.csv

&#x20;              

