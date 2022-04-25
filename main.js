/* exported app, utils */

const utils = {
    ajax: {
        proxy: 'cors.klemek.fr',
        /**
         * Define a get HTTP request to be executed with .then/.catch
         * @param {string} url
         * @param {Object} data
         * @param {boolean} proxy - use cors proxy
         * @returns {Promise<Object|string>} return JSON parsed data or string
         */
        get: (url, data, proxy = false) => {
            return new Promise((resolve, reject) => {
                if (data && Object.keys(data).length) {
                    url += '?' + Object.keys(data)
                        .map(k => k + '=' + encodeURIComponent(data[k]))
                        .join('&')
                        .replace(/%20/g, '+');
                }
                const xhr = new XMLHttpRequest();
                if (proxy) {
                    const http = (window.location.protocol === 'http:' ? 'http:' : 'https:');
                    url = `${http}//${utils.ajax.proxy}/${url}`;
                }
                xhr.open('GET', url);
                xhr.onload = () => {
                    try {
                        resolve(JSON.parse(xhr.responseText));
                    } catch (ignored) {
                        resolve(xhr.responseText);
                    }
                };
                xhr.onerror = () => reject(xhr);
                xhr.send();
            });
        },
    },
    date: {
        formatApi: function(date) {
            return `${date.getFullYear()}-${('0' + (date.getMonth() + 1)).slice(-2)}-${('0' + date.getDate()).slice(-2)}`;
        },
        formatHuman: function(date) {
            return `${('0' + date.getDate()).slice(-2)}/${('0' + (date.getMonth() + 1)).slice(-2)}`;
        },
        toMidnight: function(date) {
            return new Date(date.getFullYear(), date.getMonth(), date.getDate());
        },
        addDays: function(date, i) {
            return new Date(date.getTime() + (60 * 60 * 24 * 1000 * i));
        },
        addTime: function(date, i) {
            return new Date(date.getTime() + (60 * 1000 * i));
        },
        equals: function(date1, date2) {
            return Math.floor(date1.getTime() / (1000 * 60)) === Math.floor(date2.getTime() / (1000 * 60));
        },
    },
};

let app = {
    data() {
        return {
            theaters: null,
            theaterId: '',
            shows: null,
            versions: {
                vf: { id: 'vf', selected: false },
                vfst: { id: 'vfst', selected: false },
                vo: { id: 'vo', selected: true },
                vost: { id: 'vost', selected: true },
            },
            startDate: utils.date.toMidnight(new Date()),
            startDateInput: utils.date.formatApi(utils.date.toMidnight(new Date())),
            cachedColumns: null,
            cachedColumnsDate: null,
            timetable: {},
            showTimetable: false,
            cachedTable: {},
            maxColumnWidth: {},
            remaining: 0,
        };
    },
    watch: {
        theaterId(newValue) {
            if (newValue) {
                setTimeout(this.fetchZoneDetails);
            }
        },
        startDateInput(newValue) {
            if (newValue) {
                this.startDate = new Date(newValue);
                setTimeout(this.fetchZoneDetails);
            }
        },
    },
    computed: {
        theater() {
            return this.theaters.find(theater => theater.slug === this.theaterId);
        },
        total() {
            return this.shows ? this.shows.length * 7 : 0;
        },
        rows() {
            return [ ...Array((24 - 10) * 12).keys() ]
                .map(i => {
                    const hour = Math.floor((10 + i / 12));
                    const minute = (i % 12) * 5;
                    return {
                        hour: hour,
                        minute: minute,
                        format: `${('0' + hour).slice(-2)}:${('0' + minute).slice(-2)}`,
                        time: hour * 60 + minute,
                    };
                });
        },
        columns() {
            if (!this.cachedColumns || this.cachedColumnsDate !== this.startDate) {
                const startDate = this.startDate;
                this.cachedColumns = [];
                [ ...Array(7).keys() ].forEach(i => {
                    const date = utils.date.toMidnight(utils.date.addDays(startDate, i));
                    [ ...Array(this.maxColumnWidth[date]).keys() ].forEach(id => {
                        this.cachedColumns.push({
                            date: date,
                            format: utils.date.formatHuman(date),
                            id: id,
                        });
                    });
                });
            }
            return this.cachedColumns;
        },
    },
    methods: {
        showApp() {
            document.getElementById('app').setAttribute('style', '');
        },
        fetchApi(endpoint) {
            return utils.ajax.get(`https://www.cinemaspathegaumont.com/api/${endpoint}`, {}, utils.ajax.proxy);
        },
        fetchTheaters() {
            return this.fetchApi('cinemas').then(this.loadTheaters);
        },
        loadTheaters(data) {
            this.theaters = data;
        },
        fetchZoneDetails() {
            return this.fetchApi(`zone/${this.theater.citySlug}`).then(this.loadZoneDetails);
        },
        loadZoneDetails(data) {
            Promise.all(data.shows
                .filter(show => show.bookable)
                .map(this.fetchShow))
                .then(this.loadShows);
        },
        fetchShow(show) {
            return this.fetchApi(`show/${show.slug}`);
        },
        loadShows(shows) {
            this.shows = shows.filter(show => show.isMovie);
            console.log(this.shows);
            this.loadTimetable();
        },
        loadTimetable() {
            this.showTimetable = false;
            this.remaining = 7 * this.shows.length;
            [ ...Array(7).keys() ].forEach(i => {
                const date = utils.date.toMidnight(utils.date.addDays(this.startDate, i));
                this.timetable[date] = [];
                this.shows.forEach(show => {
                    this.fetchApi(`show/${show.slug}/showtimes/${this.theater.slug}/${utils.date.formatApi(date)}`)
                        .then(data => {
                            data.forEach(showtimes => {
                                showtimes.show = show;
                                showtimes.start = new Date(showtimes.time);
                                showtimes.end = utils.date.addTime(showtimes.start, showtimes.show.duration);
                                showtimes.id = null;
                                this.timetable[date].push(showtimes);
                            });
                            this.remaining -= 1;
                            if (this.remaining === 0) {
                                console.log(this.timetable);
                                this.loadColumns();
                            }
                        });
                });
            });
        },
        loadColumns() {
            this.showTimetable = false;
            this.cachedTable = {};
            this.maxColumnWidth = {};
            this.cachedColumns = null;
            [ ...Array(7).keys() ].forEach(i => {
                const date = utils.date.toMidnight(utils.date.addDays(this.startDate, i));
                this.maxColumnWidth[date] = 1;
                this.rows.forEach(row => {
                    const current = utils.date.addTime(date, row.time);
                    const movies = this.timetable[date].filter(
                        showtimes => showtimes.start <= current &&
                        showtimes.end >= current &&
                        this.versions[showtimes.version]?.selected,
                    );
                    const ids = movies.map(movie => movie.id).filter(id => id !== null);
                    movies.forEach(movie => {
                        if (movie.id === null) {
                            let id = 0;
                            while (ids.includes(id)) {
                                id++;
                            }
                            movie.id = id;
                            ids.push(id);
                            if (id + 1 > this.maxColumnWidth[date]) {
                                this.maxColumnWidth[date] = id + 1;
                            }
                        }
                    });
                    this.cachedTable[current] = movies;
                });
            });
            this.showTimetable = true;
        },
        changeVersions() {
            this.loadColumns();
        },
        getMovie(row, column) {
            if (! this.timetable[column.date]) {
                return null;
            }
            const current = utils.date.addTime(column.date, row.time);
            return this.cachedTable[current].find(movie => movie.id === column.id);
        },
        shouldShow(row, column) {
            const current = utils.date.addTime(column.date, row.time);
            const movie = this.getMovie(row, column);
            return !movie || utils.date.equals(movie.start, current);
        },
        rowSpan(row, column) {
            const movie = this.getMovie(row, column);
            if (!movie) {
                return 1;
            }
            return Math.floor(movie.show.duration / 5) + 1;
        },
        getClass(row, column) {
            const classes = [];
            if (row.minute === 0) {
                classes.push('hour');
            } else if (row.minute % 15 === 0) {
                classes.push('quart');
            }
            if (column.id === 0) {
                classes.push('start');
            }
            if (this.getMovie(row, column)) {
                classes.push('film');
            }
            return classes;
        },
        getInfo(row, column) {
            const movie = this.getMovie(row, column);
            if (movie) {
                return `${('0' + movie.start.getHours()).slice(-2)}:${('0' + movie.start.getMinutes()).slice(-2)} - ${movie.show.title}`;
            }
            return null;
        },
        getStyle(row, column) {
            const movie = this.getMovie(row, column);
            if (movie) {
                return {
                    backgroundImage: `url("${movie.show.posterPath.md}")`,
                };
            }
            return {};
        },
        onClick(row, column) {
            const movie = this.getMovie(row, column);
            if (movie) {
                window.location = movie.refCmd;
            }
        },
    },
    mounted: function () {
        console.log('app mounted');
        setTimeout(this.showApp);
        this.fetchTheaters();
    },
};

window.onload = () => {
    app = Vue.createApp(app);
    app.mount('#app');
};
