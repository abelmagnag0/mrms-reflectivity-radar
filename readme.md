# MRMS Radar Display — Full-Stack Weather Radar  

**Desafio:** Construir uma aplicação full-stack que exibe o radar ao vivo do produto “Reflectivity at Lowest Altitude – RALA” (ou produto equivalente) do Multi‑Radar/Multi‑Sensor System (MRMS), com frontend em React, backend customizado, renderização em mapa interativo e funcionalidade de tooltip ao passar o mouse.

---

## 1. Visão Geral da Arquitetura  

**Objetivo chave:**  

- Consumir dados brutos da MRMS (via AWS S3) dinamicamente, sem depender de pré-processamento único ou estático.  
- Processar esses dados no backend e disponibilizar artefatos (imagem de overlay + grid de valores + metadados) para o frontend.  
- Renderizar no frontend um mapa interativo que ao recarregar ou após alguns minutos exibe os **dados mais recentes** (atualização automática ou via recarga de página).  
- Permitir que o usuário veja detalhes de reflectividade passando o mouse sobre o mapa (tooltip com lat/lon/valor).  
- Usar uma arquitetura leve e prática, adequada para entrega em 4 horas.

**Componentes principais:**  

- **Backend**: Node.js + Express (ou Python + FastAPI) – lida com seleção do arquivo mais recente da MRMS, parsing, geração de artefatos, cache e endpoints REST.  
- **Frontend**: React (com Vite) + Leaflet (via react-leaflet) + TailwindCSS (ou CSS módulo) – consome API, renderiza mapa, overlay, tooltip, atualização.  
- **Deploy**: Plataforma gratuita (por ex. Render.com) para hospedar backend + frontend.

---

## 2. Cobertura Geográfica da Fonte de Dados  

- O MRMS opera primariamente sobre o domínio continental dos Estados Unidos (CONUS) — aproximadamente longitude de -130° W a -60° W e latitude de ~20° N a ~55° N. :contentReference[oaicite:1]{index=1}  
- Portanto **não se trata de cobertura global** ou mundial. Essa limitação deve ser considerada no escopo da aplicação: o mapa deve focar em EUA/CONUS ou indicar onde os dados estão disponíveis.  
- A documentação da fonte destaca a natureza da cobertura (“seamless 3D radar mosaic across the conterminous United States (CONUS) …”). :contentReference[oaicite:2]{index=2}  
- Em resumo: o produto da aplicação **suporta dados apenas para EUA/CONUS (e territórios se aplicável)** — e isso deve estar explícito para quem for usar ou avaliar.

---

## 3. Sobre a Fonte de Dados & AWS  

- Os dados da MRMS estão disponíveis publicamente via o bucket `noaa-mrms-pds` no Amazon Web Services (AWS) S3 como parte do programa de dados abertos da National Oceanic and Atmospheric Administration (NOAA). :contentReference[oaicite:5]{index=5}  
- A estrutura no bucket organiza regiões (ex: CONUS, ALASKA, HAWAII, CARIB, GUAM) e produtos (ex: `MergedReflectivityQCComposite_00.50`, `MultiSensor_QPE_12H_Pass2_00.00`, `POSH_00.50`).  
- A atualização dos dados para alguns produtos é de aproximadamente **2 minutos** de frequência. :contentReference[oaicite:6]{index=6}  
- Usar essa fonte direta confere robustez e demonstra que estamos lidando com dados em tempo real/dinamicamente atualizáveis — algo crítico para o requisito de “nova renderização ao recarregar”.

---

## 4. Stack Técnica  

| Camada        | Tecnologia proposta                    | Justificativa |
|---------------|-----------------------------------------|--------------|
| Frontend      | React 18 + Vite                         | Setup rápido, compatível com protótipo e entrega ágil. |
| Mapa          | Leaflet.js (via react-leaflet)         | Suporte para overlay raster/imagem + captura de eventos de hover/mouse. |
| UI            | TailwindCSS (ou CSS módulo)             | Permite estilização rápida e limpa. |
| Backend       | Node.js + Express                        | API REST leve, fácil deploy, integração com front em JavaScript. Alternativa: Python + FastAPI se preferir leitura de GRIB2 mais direta. |
| Parsing MRMS  | Python (xarray + cfgrib) **ou** Node.js (grib-parser) | O tutorial usa Python/xarray para leitura de GRIB2. |
| Deploy        | Render.com (ou plataforma similar)      | Hospedagem rápida e gratuita. |
| Cache         | node-cache (ou equivalente)             | Para evitar reprocessamento desnecessário e atender atualização dinâmica. |

---

## 5. Estrutura de Pastas (esqueleto)  

```

/mrms-radar
├── /backend
│   ├── server.js
│   ├── /services
│   │   ├── mrmsService.js           # lógica: listagem S3, selecionar arquivo mais recente
│   │   ├── cacheService.js         # cache in-memory/arquivos
│   │   ├── rasterService.js        # converte dados para imagem PNG overlay
│   │   └── gridService.js          # extrai grid de valores + metadados
│   ├── /routes
│   │   └── radarRoutes.js          # endpoints REST (latest, tile, grid)
│   └── /utils
│       └── gribParser.js           # parse de GRIB2/NetCDF ou Python script invocado
├── /frontend
│   ├── /src
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── /components
│   │   │    ├── MapView.jsx
│   │   │    └── Legend.jsx
│   │   ├── /hooks
│   │   │    └── useRadarData.js
│   │   └── /services
│   │        └── api.js             # chamadas à API backend
│   └── /public
│        └── favicon.ico
└── README.md

````

---

## 6. Fluxo de Dados & Formatos  

- **Origem:** arquivos GRIB2 (normalmente com extensão `.grib2.gz`) da MRMS no bucket AWS S3. Tutorial mostra código para listar e baixar via `s3fs` ou URL direta.  
- **Processamento no backend:**  
  1. Listar bucket para região + produto + data atual.  
  2. Selecionar o arquivo mais recente (por exemplo via timestamp no nome).  
  3. Verificar se está dentro de janela aceitável (“últimas X minutos”).  
  4. Baixar, descompactar (`.gz` → `.grib2`), carregar via `xarray` ou parser equivalente.  
  5. Extrair metadados: timestamp, `minLat`, `maxLat`, `minLon`, `maxLon`, número de linhas (`rows`) e colunas (`cols`) — a resolução típica é ~0.01° (~1 km) para alguns produtos. :contentReference[oaicite:7]{index=7}  
  6. Produzir dois artefatos:  
     - **Imagem de overlay** (PNG) que cobre exatamente os bounds geográficos definidos.  
     - **Grid de valores + metadados** (JSON) com a seguinte estrutura proposta:  

       ```json
       {
         "timestamp": "2025-11-07T01:12:00Z",
         "bounds": [south, west, north, east],
         "rows": 500,
         "cols": 800,
         "minValue": <…>,
         "maxValue": <…>,
         "data": [ <linear array length rows*cols> ],
         "imageUrl": "/api/radar/tile.png"
       }
       ```  

- **Frontend:**  
  - Chama endpoint `GET /api/radar/latest` para obter JSON de metadados + `imageUrl`.  
  - Usa `L.imageOverlay(imageUrl, bounds, { interactive: true })` para renderizar no mapa.  
  - Carrega ou embarca o `data` array do grid.  
  - Ao mover o mouse sobre o mapa (evento `mousemove` ou `mouseover`): converte `lat/lon` → índice `(i,j)` → valor correspondente, e exibe tooltip.  

    ```js
    const { bounds: [south, west, north, east], rows, cols, data } = metadata;
    const latStep = (north - south) / (rows - 1);
    const lonStep = (east  - west ) / (cols - 1);
    const i = Math.floor((lat - south) / latStep);
    const j = Math.floor((lon - west ) / lonStep);
    if (i >= 0 && i < rows && j >= 0 && j < cols) {
      const value = data[i * cols + j];
      // exibir tooltip com lat, lon, value
    }
    ```  

- **Atualização dinâmica:**  
  - A API/backend deve verificar periodicamente (ou em cada chamada) se há novo arquivo disponível, processar e atualizar artefatos.  
  - No frontend, ao recarregar a página (ou em intervalo configurado) a camada renderizada será a mais recente — cumprindo requisito de “Se você recarregar a página alguns minutos depois, deve aparecer dado de radar mais novo (não pré-processado permanentemente)”.

---

## 7. Endpoints Principais  

- `GET /api/health` — verifica status do backend (retorno por exemplo `{ status: "ok" }`).  
- `GET /api/radar/latest` — retorna JSON com metadados (timestamp, bounds, rows, cols, minValue, maxValue, imageUrl).  
- `GET /api/radar/tile.png` — imagem PNG da camada de reflectividade mais recente.  
- `GET /api/radar/grid.json` — (opcional) se grid estiver servido separadamente; ou `data` pode estar embutido no `latest`.

---

## 8. Ferramentas e Bibliotecas — Justificativas  

- **react-leaflet**: permite renderizar mapas interativos e camadas de imagem, capturar eventos de mouse para hover/tooltip.  
- **axios** (frontend) / **node-fetch** (backend): para requisições HTTP simples e consistentes.  
- **node-cache** ou equivalente: para cache no backend e evitar reprocessamento desnecessário.  
- **pngjs** ou **canvas**: para geração de PNG overlay a partir da matriz de dados.  
- **tailwindcss**: para estilização rápida, sem exigir grande esforço em design.  
- **xarray + cfgrib** (Python) ou bibliotecas GRIB2 em Node: tutorial de MRMS usa xarray para leitura de GRIB2.  
- **cors**, **express**: para API REST leve.

---

## 9. Estratégia de Performance & Simplicidade  

- Cache com TTL curto (ex: 300 s ou conforme intervalo de dados) para evitar download/parsing repetido.  
- Manter grid de valores com tamanho moderado (ex: 500×800) para garantir que as operações de hover sejam rápidas.  
- Usar imagem PNG overlay leve para reduzir latência de download e renderização.  
- No frontend, limitar frequência de eventos de `mousemove` (ex: via `throttle` a cada 50-100ms) para desempenho fluido.  
- Definir viewport inicial do mapa para a onda de dados suportada (EUA/CONUS) para evitar renderização de áreas sem cobertura.

---

## 10. UI/UX – Resumo  

- Tela única com mapa em full-screen (ideal para desktop).  
- Overlay de radar com transparência (~60%) para visualizar o mapa base junto com o radar.  
- Legenda lateral (ou barra inferior) com escala de cores para reflectividade (em dBZ).  
- Rodapé ou canto do mapa com “Última atualização: {timestamp} UTC”.  
- Tooltip ao passar o mouse mostrando:  
  - Latitude (°N)  
  - Longitude (°E)  
  - Reflectividade (dBZ ou valor correspondente)  
- Interface responsiva para desktop e tablet (para mobile, simplificar se necessário).

---

## 11. Deploy & Ambiente  

- Plataforma sugerida para deploy: Render.com (ou outro serviço gratuito de hospedagem full-stack).  
- Variáveis de ambiente no backend:  

  ```bash
  MRMS_S3_BASE_URL=https://noaa-mrms-pds.s3.amazonaws.com/
  CACHE_TTL=300
  PORT=8080

````

* Procedimento de deploy:

  * Frontend: `npm run build` → servir como estático ou via Express.
  * Backend: `npm start` (ou `uvicorn main:app` se em Python).
  * Verificar e configurar CORS se frontend e backend estiverem em domínios diferentes.

---

## 12. Roadmap de Execução (4h)

| Tempo   | Etapa                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 0h – 1h | Configurar repositório + inicializar backend + rota `/api/health`, stub de `/api/radar/latest`.                                            |
| 1h – 2h | Backend: integrar listagem S3, seleção do arquivo mais recente, download, parsing, geração de PNG + grid + endpoint real.                  |
| 2h – 3h | Frontend: criar React app + Leaflet + consumir `latest`, adicionar overlay + carregar grid de valores + implementar hover/tooltip.         |
| 3h – 4h | Estilização com TailwindCSS, testar atualização dinâmica (recarregar página ou intervalo), deploy no Render, ajustes finais, documentação. |

---

## 13. Perguntas de Clarificação para o Entrevistador

* Qual intervalo de atualização você espera (ex: 2 min, 5 min, 10 min)?
* Qual região geográfica precisa suportar (ex: somente CONUS ou também Alaska/Hawai‘i/territórios)?
* Será necessário suporte histórico ou animação de múltiplos frames ou apenas o frame mais recente?
* Qual nível de zoom e detalhamento de tiles desejado (overlay único vs tiles por zoom)?
* Qual nível de UI/UX é esperado — protótipo funcional ou interface altamente refinada?

---

## 14. Conclusão

Este plano atende integralmente os requisitos, com especial atenção para:

* Dados atualizados dinamicamente (sem “pré-processamento único”).
* Cobertura claramente definida para EUA/CONUS.
* Frontend em React com mapa interativo + overlay + tooltip.
* Backend que processa dados em tempo real, gera artefatos, expõe API.
* Integração técnica e de usabilidade bem pensada e documentada.

Boa implementação!

