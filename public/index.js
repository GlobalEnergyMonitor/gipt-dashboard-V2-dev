const converter = new showdown.Converter();
const config = {
    datasets: {}
};
const graphs = {};
const tickers = {
    options: []
};

getData();

async function getData() {
    const urls = ["./assets/page-config.json", "./assets/chart-config.json", "./assets/text-config.json"];
    const keys = ["dashboard", "charts", "text"];
    const promises = [];
    for (const url of urls) {
        promises.push(fetch(url));
    }

    Promise.all(promises)
        .then(responses => Promise.all(responses.map(r => r.json())))
        .then(jsonObjects => {
            jsonObjects.forEach((obj, i) => {
                config[keys[i]] = obj;
            })
        })
        .then(() => {
            const dataURLS = [];
            config.dashboard.flourish_ids.forEach(id => {
                dataURLS.push(`./assets/data/${config.charts[id].dataset}.json`);
                config.datasets[id] = [];
            })
            if (config.dashboard.tickers) {
                dataURLS.push('https://public.flourish.studio/visualisation/16565310/visualisation.json') // this assumes we want the same template for all tickers
                dataURLS.push(`./assets/data/${config.dashboard.ticker_data}.json`)
                config.datasets.ticker = {};
            }
            const fetches = [];
            for (const url of dataURLS) {
                fetches.push(fetch(url));
            }
            Promise.all(fetches)
                .then(responses => {
                    return Promise.all(responses.map(r => r.json()))
                })
                .then(jsonObjects => {
                    jsonObjects.forEach((obj, i) => {
                        if (config.dashboard.tickers) {
                            if (i < jsonObjects.length - 2) {
                                config.datasets[config.dashboard.flourish_ids[i]] = obj;
                            } else {
                                if (obj.template && obj.template === '@flourish/number-ticker') config.datasets.ticker.flourish_template = obj;
                                else config.datasets.ticker.data = obj;
                            }
                        } else config.datasets[config.dashboard.flourish_ids[i]] = obj;
                    })
                })
                .then(() => {
                    document.querySelector('h1').innerHTML = markdownToHTML(config.text.title);
                    if (config.dashboard.overall_summary) document.querySelector('.dashboard-intro--para').innerHTML = markdownToHTML(insertOverallSummary());
                    if (config.dashboard.input_type === 'dropdown') implementDropdown();
                    if (config.dashboard.input_type === 'buttons') implementFilterButtons();
                    if (config.text.footer) document.querySelector('.dashboard-footer').innerHTML = markdownToHTML(config.text.footer);
                    // add another to implement combo
                })
                .then(() => renderTickers())
                .then(() => renderVisualisation())
                .then(() => {
                    if (config.dashboard.extra_visualisations) addExtraVisualisations();
                })
                .catch((error) => {
                    console.error(error);
                });
        })
}


function implementDropdown() {
    if (!config.text.dropdown_label) throw new Error('input_label not found or does not match input type. Check page and text configs');
    const label = document.createElement('label');
    label.innerHTML = markdownToHTML(config.text.dropdown_label);
    label.for = "dropdown-selection"
    const dropdownEl = document.createElement('select');
    dropdownEl.id = "dropdown-selection";

    if (!config.text.dropdown) throw new Error('page-config specifies input of dropdown but text-config does not match')

    let dropdownData = (typeof config.dashboard.input_filter === 'string') ?
        config.text.dropdown.map(entry => entry[config.dashboard.input_filter]) :
        config.dashboard.input_filter;

    dropdownData.forEach(input => {
        const opt = document.createElement('option');
        opt.value = formatName(input);
        opt.text = input;
        dropdownEl.appendChild(opt);
    });

    const controlsContainer = document.querySelector('.controls-container');
    controlsContainer.appendChild(label);
    controlsContainer.appendChild(dropdownEl);
    controlsContainer.classList.add('controls-container--dropdown');

    dropdownEl.addEventListener('change', (evt) => {
        const selectedValue = evt.target.value;
        updateSummaries(selectedValue);
        updateGraphs(selectedValue);
    })
}

function implementFilterButtons() {
    if (!config.text.buttons_label) throw new Error('input_label not found or does not match input type. Check page and text configs')
    const label = document.createElement('legend');
    label.innerHTML = markdownToHTML(config.text.buttons_label);
    label.for = "button-group"
    const btnGroup = document.createElement('fieldset');
    btnGroup.classList.add('button-group');
    btnGroup.appendChild(label);

    btnsWrapper = document.createElement('div');
    btnsWrapper.classList.add('buttons-wrapper');
    btnGroup.appendChild(btnsWrapper);

    if (!config.text.buttons) throw new Error('page-config specifies input of buttons but text-config does not match')

    let buttonData = (typeof config.dashboard.input_filter === 'string') ?
        config.text.buttons.map(entry => entry[config.dashboard.input_filter]) :
        config.dashboard.input_filter;

    buttonData.forEach((button, i) => {
        const btnContainer = document.createElement('div');
        btnContainer.classList.add('filter-button');

        const btn = document.createElement('input');
        btn.type = 'radio';
        if (i === 0) btn.checked = "checked";
        // btn.classList.add('filter-button');
        btn.value = formatName(button);
        btn.id = formatName(button);
        btn.text = button;
        btn.name = 'filter';
        const label = document.createElement('label');
        label.innerHTML = button;
        label.for = formatName(button);

        btnContainer.appendChild(label);
        btnContainer.appendChild(btn);
        btnsWrapper.appendChild(btnContainer);
    });
    const controlsContainer = document.querySelector('.controls-container');
    controlsContainer.appendChild(btnGroup);
    controlsContainer.classList.add('controls-container--buttons');

    const buttonEls = document.querySelectorAll('.filter-button input');
    buttonEls.forEach(btn => {
        btn.addEventListener('click', (evt) => {
            buttonEls.forEach(btnEl => btnEl.checked = false);
            evt.target.checked = "checked";

            const selectedValue = evt.target.value;
            updateSummaries(selectedValue);
            updateGraphs(selectedValue);
        })
    });
}

function renderTickers() {
    if (config.dashboard.tickers) {
        const container = document.createElement('div');
        container.classList.add('tickers-container');
        document.querySelector('.dashboard-intro').appendChild(container);
        const initialData = initialTickerData()[0];

        const {
            state
        } = config.datasets.ticker.flourish_template;
        if (config.dashboard["ticker_text_font-size"]) {
            const tickerTextSplit = config.dashboard["ticker_text_font-size"]
                .match(/[a-zA-Z]+|[0-9]+(?:\.[0-9]+)?|\.[0-9]+/g); // grab text size from config and split into size and unit needed in flourish:
            state.font_size = tickerTextSplit[0];
            state.font_unit = tickerTextSplit[1]
        }

        const options = {
            template: "@flourish/number-ticker",
            version: '1.5.1',
            api_url: "/flourish",
            api_key: "", //filled in server side
            state: {
                ...state
            }
        };

        config.dashboard.tickers.forEach((entry, i) => {
            const {
                id
            } = entry;
            const container = document.createElement('div');
            container.id = id;
            container.classList.add('ticker-container');
            document.querySelector('.tickers-container').appendChild(container);

            const tickerConf = config.dashboard.tickers.filter(entry => entry.id === id)[0];
            tickers[id] = {};
            tickers[id].options = {
                ...options,
                container: `#${id}`,
                state: {
                    ...options.state,
                    custom_template: formatWithTickerStyling(initialData, id),
                    value_format: {
                        ...options.state.value_format,
                        n_dec: tickerConf.decimal_places,
                    }
                }
            }
            tickers[id].flourish = new Flourish.Live(tickers[id].options);
            tickers[id].flourish.iframe.style.width = "100%"; // needed to override full width in safari
        });
    }
}

function updateTickers() {
    config.dashboard.tickers.forEach((entry, i) => {
        const {
            id
        } = entry;
        const data = filterTickerData(getSelectedText());
        if (data[id]) {
            tickers[id].options.state.custom_template = formatWithTickerStyling(data, id)
            tickers[id].flourish.update(tickers[id].options)
            document.querySelector(`#${id} iframe`).style.opacity = 1;
        } else document.querySelector(`#${id} iframe`).style.opacity = 0.3;
    });
}

function formatWithTickerStyling(data, id) {
    const text = data[id];
    const {
        style
    } = config.dashboard.tickers.filter(entry => entry.id === id)[0];
    const colourOverride = data[`${id}_color`];
    const styledSpan = Object.entries(style).reduce((prev, [key, val]) => `${prev} ${key}: ${(key === 'color' && colourOverride) ? colourOverride : val};`, '<span style="') + '">';
    return text.replace('<span>', styledSpan);
}

function renderVisualisation() {
    const graphIDs = config.dashboard.flourish_ids;

    graphIDs.forEach(id => {
        const container = document.createElement('div');
        container.id = `chart-${id}`;
        container.classList.add('chart-container');

        // Add special layout class for the time-map chart
        if (String(id) === "24167887") {
            container.classList.add('map-chart-container');
        }

        document.querySelector('.flourish-container').appendChild(container);

        insertChartSummary(id);
        implentGraph(id);
    });
}

function insertOverallSummary() {
    let summaryObj = config.text[(config.dashboard.input_type === 'dropdown') ? 'dropdown' : 'buttons'];
    const filterKey = (typeof config.dashboard.input_filter === 'string') ? config.dashboard.input_filter : config.dashboard.input_key;
    summaryObj = summaryObj.filter(entry => entry[filterKey] === config.dashboard.input_default)[0];
    if (!summaryObj.overall_summary) throw new Error('Overall Summary set to true but no text values given');
    return summaryObj.overall_summary;
}

function insertChartSummary(id) {
    const currentGraph = config.charts[id];
    if (currentGraph.summary) {
        const summary = document.createElement('p');
        summary.classList.add('chart-summary');
        let summaryTextObj;

        if (typeof currentGraph.filter_by === 'string') {
            summaryTextObj = filterSummaries(currentGraph.filter_by, config.charts[id].initial_state);
        } else {
            summaryTextObj = config.text[(config.dashboard.input_type === 'dropdown') ? 'dropdown' : 'buttons'].filter(entry => entry[config.dashboard.input_key] === config.dashboard.input_default)[0];
        }
        if (summaryTextObj[currentGraph.summary]) {
            summary.innerHTML = markdownToHTML(summaryTextObj[currentGraph.summary]);
            document.querySelector(`#chart-${id}`).appendChild(summary);
        }
    }
}

function updateSummaries(key) {
    const filterKey = (typeof config.dashboard.input_filter === 'string') ? config.dashboard.input_filter : config.dashboard.input_key;
    const summaryTextObj = filterSummaries(filterKey, getSelectedText());

    if (config.dashboard.overall_summary) updateOverallSummary(summaryTextObj);
    if (config.dashboard.tickers) updateTickers(key);
    updateGraphSummaries(key, summaryTextObj);
}

function filterSummaries(key, selected) {
    const summaryObj = config.text[(config.dashboard.input_type === 'dropdown') ? 'dropdown' : 'buttons'];
    return summaryObj.filter(entry => entry[key] === selected)[0];
}

function updateOverallSummary(summaryTextObj) {
    document.querySelector('.dashboard-intro--para').innerHTML =
        markdownToHTML((summaryTextObj.overall_summary) ? summaryTextObj.overall_summary : '');
}

function updateGraphSummaries(key, summaryTextObj) {
    const graphIDs = config.dashboard.flourish_ids;
    graphIDs.forEach(id => {
        const currentGraph = config.charts[id];
        if (currentGraph.filterable && currentGraph.summary) {
            let filteredData;
            if (typeof config.charts[id].filter_by === 'string') {
                filteredData = config.datasets[id].filter(entry => formatName(entry[currentGraph.filter_by]) === key);
            } else {
                if (getUnformattedInputName(key) === 'All') filteredData = config.datasets[id];
                else filteredData = filterDataOnColumnName(key, id);
            }
            const summary = document.querySelector(`#chart-${id} .chart-summary`);
            if (summary) {
                summary.innerHTML = markdownToHTML(
                    (filteredData.length <= 0 || !summaryTextObj[currentGraph.summary]) ?
                        config.text.no_data.replace("{{selected}}", summaryTextObj[config.dashboard.input_filter]) : summaryTextObj[currentGraph.summary]);
            }
        }
    });
}


function implentGraph(id) {
    graphs[id] = {};
    // Special case for the time-map chart
    if (id === "24167887") {
        const fullData = config.datasets["24167887"];
        const selected = getSelectedText(); // e.g. "World", "France"

        const filtered = selected.toLowerCase() === "world"
            ? fullData
            : fullData.filter(entry =>
                entry["Country/area"]?.trim().toLowerCase() === selected.trim().toLowerCase()
            );

        const containerId = `chart-${id}`;
        const container = document.querySelector(`#${containerId}`);
        container.innerHTML = "";

        const chart = new Flourish.Live({
            base_visualisation_id: "24167887",            // ← your blank Flourish shell ID
            api_key: "ZkqdL7nzFCQAihbjv-7j0UIm_r3rCCq-IYy4JfCahp9Qs-_dmIGzLn4O_DpcEhiv",                 // API key
            container: `#${containerId}`,
            overwrite_data: true,
            //clear_existing_visualisation_data: true,  //  <- this clears out ghost rows
            state: {
                categorical_custom_palette: {
                    "bioenergy": "#71AB5B",
                    "oil/gas": "#E97777",
                    "solar": "#FEC260",
                    "hydro": "#2FA4FF",
                    "wind": "#B8E1FF",
                    "nuclear": "#8E44AD",
                    "coal": "#7F8C8D"
                }
            },
            bindings: {
                events: {
                    color: "Type",
                    lat: "Latitude",
                    lon: "Longitude",
                    metadata: ["Plant / Project name", "Capacity (MW)", "Technology", "Country/area"],
                    name: "Type",
                    scale: "Capacity (MW)"
                }
            },
            data: {
                events: filtered
            }
        });

        graphs[id].flourish = chart;
        return;
    }
    // Standard fetch for other charts
    fetch(`https://public.flourish.studio/visualisation/${id}/visualisation.json`)
        .then((response) => response.json())
        .then((options) => {
            const data = config.datasets[id];
// 
if (options.template === "@flourish/scatter" || (config.charts[id] && config.charts[id].type === "scatter")) {
  const currentGraph = config.charts[id];

const filteredData = initialData(id);

  // EXACT headers the vis was authored with (duplicates are intentional)
  const headers = [
    "Age Category","Type","Country","Type","Country","Type","Age Category","Capacity (GW)","Capacity %","Capacity %"
  ];

  const rows = filteredData.map(d => {
    // Optional fallback: derive GW if only MW exists
    const capGW =
      d["Capacity (GW)"] != null ? d["Capacity (GW)"]
      : (d["Capacity (MW)"] != null ? Number(d["Capacity (MW)"]) / 1000 : null);

    return [
      d["Age Category"],         // 0  x
      d["Type"],                 // 1  color
      d["Country"],              // 2  filter
      d["Type"],                 // 3  y
      d["Country"],              // 4  metadata[0]
      d["Type"],                 // 5  metadata[1]
      d["Age Category"],         // 6  metadata[2]
      capGW,                     // 7  metadata[3]
      d["Capacity %"],           // 8  metadata[4]
      d["Capacity %"]            // 9  size
    ];
  });

  graphs[id].opts = {
    template: "@flourish/scatter",
    version: "33.4.2",
    container: `#chart-${id}`,
    api_url: "/flourish",
    api_key: "",
    base_visualisation_id: id,
    // Use index-based bindings to match the authored vis exactly
    bindings: {
      data: {
        name: [],
        x: 0,
        color: 1,
        filter: 2,
        y: 3,
        metadata: [4, 5, 6, 7, 8],
        size: 9
      }
    },
    data: { data: [headers, ...rows] },
    // Keep state minimal to avoid referencing missing columns
    state: {
      layout: {
        title: (currentGraph.title || '').replace('{{country}}', ''),
        subtitle: currentGraph.subtitle || ''
      }
    }
  };

  graphs[id].flourish = new Flourish.Live(graphs[id].opts);
  return;
}

            const hierarchyCharts = {
                "23191160": {
                    filter: "Country",
                    nest_columns: ["Type", "Parent"],
                    size_columns: ["Capacity (GW)"]
                },
                "23185423": {
                    filter: "Country",
                    nest_columns: ["Type", "Starts", "Status"],
                    size_columns: ["Capacity (GW)"]
                }
            };

            if (hierarchyCharts[id]) {
                const bindings = hierarchyCharts[id];

                graphs[id].opts = {
                    ...options,
                    container: `#chart-${id}`,
                    api_url: "/flourish",
                    api_key: "",
                    base_visualisation_id: id,
                    bindings: {
                        data: bindings
                    },
                    data: {
                        data: data
                    }
                };

                graphs[id].flourish = new Flourish.Live(graphs[id].opts);
                return;
            }

            // Standard charts
            graphs[id].opts = {
                ...options,
                container: `#chart-${id}`,
                api_url: "/flourish",
                api_key: "ZkqdL7nzFCQAihbjv-7j0UIm_r3rCCq-IYy4JfCahp9Qs-_dmIGzLn4O_DpcEhiv",
                base_visualisation_id: id,
                bindings: {
                    ...options.bindings,
                    data: {
                        ...options.bindings.data,
                        label: config.charts[id].x_axis,
                        value: config.charts[id].values
                    }
                },
                data: {
                    ...options.data,
                    data: initialData(id),
                },
                state: {
                    ...options.state,
                    layout: {
                        title: (config.charts[id].title || '').replace('{{country}}', ''),
                        subtitle: config.charts[id].subtitle || ''
                    }
                }
            };

            if (options.template === "@flourish/line-bar-pie") {
                graphs[id].opts.version = 25;
            }

            graphs[id].flourish = new Flourish.Live(graphs[id].opts);
        });
}

function updateGraphs(key) {
    const graphIDs = config.dashboard.flourish_ids;

    graphIDs.forEach(id => {
        const currentGraph = config.charts[id];

        //  Special case for the time-map chart (kept from your file)
        if (id === "24167887") {
            const fullData = config.datasets[id];
            const selected = getUnformattedInputName(key);

            const filtered = selected.toLowerCase() === "world"
                ? fullData
                : fullData.filter(entry =>
                    entry["Country/area"]?.trim().toLowerCase() === selected.trim().toLowerCase()
                );

            const headers = [
                "Type", "Latitude", "Longitude",
                "Plant / Project name", "Capacity (MW)", "Technology",
                "Country/area", "Type", "Capacity (MW)"
            ];
            const mapped = filtered.map(entry => [
                entry["Type"],
                entry["Latitude"],
                entry["Longitude"],
                entry["Plant / Project name"],
                entry["Capacity (MW)"],
                entry["Technology"],
                entry["Country/area"],
                entry["Type"],
                entry["Capacity (MW)"]
            ]);

            const containerId = `chart-${id}`;
            const container = document.querySelector(`#${containerId}`);
            container.innerHTML = "";

            let latitudes = filtered.map(d => d["Latitude"]).filter(v => typeof v === "number");
            let longitudes = filtered.map(d => d["Longitude"]).filter(v => typeof v === "number");
            if (latitudes.length === 0 || longitudes.length === 0) {
                latitudes = [34.5, 71];
                longitudes = [-25, 40];
            }
            const pad = 0.5;
            const bounds = {
                lat_min: Math.min(...latitudes) - pad,
                lat_max: Math.max(...latitudes) + pad,
                lng_min: Math.min(...longitudes) - pad,
                lng_max: Math.max(...longitudes) + pad
            };

            const chart = new Flourish.Live({
                template: "@flourish/time-map",
                container: `#${containerId}`,
                api_url: "/flourish",
                api_key: "ZkqdL7nzFCQAihbjv-7j0UIm_r3rCCq-IYy4JfCahp9Qs-_dmIGzLn4O_DpcEhiv",
                base_visualisation_id: id,
                state: {
                    map: {
                        map_initial_bounds_lat_min: bounds.lat_min,
                        map_initial_bounds_lat_max: bounds.lat_max,
                        map_initial_bounds_lng_min: bounds.lng_min,
                        map_initial_bounds_lng_max: bounds.lng_max,
                        map_initial_type: "bounding_box",
                        points: { opacity: 60 },
                        style_base: "flourish-light"
                    }
                },
                bindings: {
                    events: {
                        color: 0, lat: 1, lon: 2,
                        metadata: [3, 4, 5, 6],
                        name: 7,
                        scale: 8,
                    }
                },
                data: {
                    events: [headers, ...mapped]   // ← fix the .mapped typo from your file
                }
            });

            graphs[id].flourish = chart;
            return;
        }

        // Filter data for all other charts
        let filteredData = config.datasets[id];
        if (currentGraph.filterable) {
            if (typeof currentGraph.filter_by === 'string') {
                filteredData = config.datasets[id].filter(entry =>
                    formatName(entry[currentGraph.filter_by]) === key
                );
            } else {
                filteredData = (getUnformattedInputName(key) === 'All')
                    ? config.datasets[id]
                    : filterDataOnColumnName(key, id);
            }
        }

const isScatter =
  graphs[id]?.opts?.template === "@flourish/scatter" ||
  currentGraph?.type === "scatter";

if (isScatter) {
  const allData = config.datasets[id];
  const filterField = currentGraph.filter_by || "Country";

  
  const headers = [
    "Age Category","Type","Country","Type","Country","Type","Age Category","Capacity (GW)","Capacity %","Capacity %"
  ];

  const rows = filteredData.map(d => {
    const capGW =
      d["Capacity (GW)"] != null ? d["Capacity (GW)"]
      : (d["Capacity (MW)"] != null ? Number(d["Capacity (MW)"]) / 1000 : null);

    return [
      d["Age Category"],
      d["Type"],
      d["Country"],
      d["Type"],
      d["Country"],
      d["Type"],
      d["Age Category"],
      capGW,
      d["Capacity %"],
      d["Capacity %"]
    ];
  });

  graphs[id].opts.bindings = {
    data: { name: [], x: 0, color: 1, filter: 2, y: 3, metadata: [4,5,6,7,8], size: 9 }
  };
  graphs[id].opts.data = { data: [headers, ...rows] };
  graphs[id].flourish.update(graphs[id].opts);

  return;
}
        // Default update path for non-scatter charts
        if (filteredData.length !== 0) {
            graphs[id].opts.data = { data: filteredData };
            graphs[id].flourish.update(graphs[id].opts);
            document.querySelector(`#chart-${id} iframe`).style.opacity = 1;
        } else {
            document.querySelector(`#chart-${id} iframe`).style.opacity = 0.3;
        }
    });
}

function formatName(string) {
    return string.toLowerCase().replace(/ /g, "_");
}

function getUnformattedInputName(string) {
    if (Array.isArray(config.dashboard.input_filter)) {
        for (const key of config.dashboard.input_filter) {
            if (formatName(key) === string) return key;
        }
    } else {
        // input_filter is a string — use it to search actual dropdown values
        const dropdownData = config.text.dropdown || [];
        for (const entry of dropdownData) {
            const candidate = entry[config.dashboard.input_filter];
            if (formatName(candidate) === string) return candidate;
        }
    }
    return string; // fallback: return original
}

function initialData(id) {
    let data = config.datasets[id];
    if (config.charts[id].filterable) {
        if (typeof config.charts[id].filter_by === 'string') {
            data = config.datasets[id].filter(entry => entry[config.dashboard.input_filter] === config.charts[id].initial_state);
        } else {
            const defaultFilter = config.dashboard.input_default;
            if (defaultFilter === "All") return data;
            else return filterDataOnColumnName(formatName(defaultFilter), id)
        }
    }
    return data;
}

function filterDataOnColumnName(key, id) {
    const filterValue = getUnformattedInputName(key);
    const x_value = config.charts[id].x_axis;
    filteredData = config.datasets[id].map(entry => {
        let output = {};
        output[filterValue] = entry[filterValue];
        output[x_value] = entry[x_value];
        return output;
    });
    return filteredData;
}

function initialTickerData() {
    return config.datasets.ticker.data.filter(entry => entry[config.dashboard.input_filter] === config.dashboard.input_default);
}

function filterTickerData(key) {
    return config.datasets.ticker.data.filter(entry => entry[config.dashboard.input_filter] === key)[0];
}

function getSelectedText() {
    if (config.dashboard.input_type === 'dropdown') {
        const dropdown = document.querySelector('select');
        return dropdown[dropdown.selectedIndex].text;
    } else if (config.dashboard.input_type === 'buttons') {
        const selectedButton = document.querySelector('input[name="filter"]:checked');
        return selectedButton.text;
    }
}

function getSelectedButton() {
    const dropdown = document.querySelector('select');
    return dropdown[dropdown.selectedIndex].text;
}

function markdownToHTML(string) {
    return converter.makeHtml(string).replace(/<\/?p[^>]*>/g, '');;
}

function addExtraVisualisations() {
    const wrapper = document.createElement('div');
    wrapper.classList.add('vis-container');
    document.querySelector('body').insertBefore(wrapper, document.querySelector('.dashboard-footer'))
    const IDsToAdd = config.dashboard.extra_visualisations;
    IDsToAdd.forEach(id => {
        const container = document.createElement('div');
        container.id = `vis-${id}`;
        container.classList.add('chart-container');
        wrapper.appendChild(container);
        new Flourish.Live({
            container: `#vis-${id}`,
            api_url: "/flourish",
            api_key: "",
            base_visualisation_id: id,
        });
    });
}

