<template>
    <div id="app">
        <main>
            <div class="main-menu">
                <div class="search-box">
                    <input type="text"
                           class="input-bar"
                           placeholder="Search drugs or diseases..."
                           v-model="query"
                           @keypress="searchSubstance" />
                </div>
                <div class="menu-button">
                    <button class="button" @click="searchSubstance('Enter')">
                        <div class="button-text">Search</div>
                    </button>
                </div>
                <div class="menu-button">
                    <button class="button" @click="draw">
                        <div class="button-text">Draw current</div>
                    </button>
                </div>
                <div class="limit-box">
                    <input type="text"
                           class="input-bar"
                           :placeholder="nodeLimit"
                           v-model="inputLimit" />
                </div>
                <div class="menu-button">
                    <button class="button" @click="changeNodeLimit()">
                        <div class="button-text">Change limit</div>
                    </button>
                </div>
                <div class="menu-button">
                    <button class="button" @click="showHelp">
                        <div class="button-text">Help</div>
                    </button>
                </div>
            </div>

            <div class="result-menu">
                <div class="information-box">
                    <div class="node">Current Node</div>
                    <p class="desc" v-html="formatNodeInfo(currentNode)"></p>
                    <div class="node">Previous Node</div>
                    <p class="desc" v-html="formatNodeInfo(previousNode)"></p>
                    <div class="result-menu-button">
                        <button class="button" @click="swapToPrevious">
                            <div class="button-text">Swap to previous</div>
                        </button>
                    </div>

                    <div class="node">Neighbours</div>
                    <select class="selector" v-model="selectedNeighbour" dense outlined>
                        <option v-for="item in currentNeighbours" :value="item" :key="item">{{ item }}</option>
                    </select>
                    <div class="node">Selected Neighbour</div>
                    <p class="desc" v-html="formatNodeInfo(selectedNeighbour)"></p>
                    <div class="result-menu-button">
                        <button class="button" @click="swapToNeighbour">
                            <div class="button-text">Swap to neighbour</div>
                        </button>
                    </div>
                </div>

                <container id="viz-container" fluid>
                </container>
            </div>
        </main>
    </div>
</template>

<script>
    import NeoVis from 'neovis.js';
    import helpText from './help.txt';

    export default {
        name: 'App',
        data() {
            return {
                protocol: 'bolt',
                host: 'localhost',
                port: '7687',
                username: 'neo4j',
                password: '12345',
                query: '',
                currentNode: null,
                previousNode: null,
                selectedNeighbour: null,
                currentNeighbours: [],
                currentNeighCount: 0,
                indicationCount: 0,
                inputLimit: '',
                nodeLimit: 10,
                viz: {},
            };
        },
        methods: {
            connectNeo4jDB() {
                return this.$neo4j.connect(this.protocol, this.host, this.port, this.username, this.password);
            },
            async changeNodeLimit() {
                if (!isNaN(parseInt(this.inputLimit))) {
                    this.nodeLimit = parseInt(this.inputLimit);
                    await this.configureNeighbours();
                    this.$swal.fire('Limit changed successfully to ' + this.nodeLimit);
                } else {
                    this.$swal.fire('Input value must be a whole number.')
                }
            },
            async checkNodeExists(substanceTypeCypher) {
                const cypherCountQuery = 'MATCH ' + substanceTypeCypher + ' WHERE toLower(n.code) = toLower($input) OR toLower(n.name) = toLower($input) RETURN count(n) AS count';
                const params = { input: this.query };

                const countResult = await this.$neo4j.run(cypherCountQuery, params);
                if (countResult.records[0].get('count') == 0) {
                    return false;
                }
                return true;
            },
            async fetchNodeResult(substanceTypeCypher) {
                const cypherNodeQuery = 'MATCH ' + substanceTypeCypher + ' WHERE toLower(n.code) = toLower($input) OR toLower(n.name) = toLower($input) RETURN n';
                const params = { input: this.query };

                const nodeResult = await this.$neo4j.run(cypherNodeQuery, params);
                if (this.currentNode != null && this.currentNode.properties['code'] != nodeResult.records[0].get('n').properties['code']) {
                    this.previousNode = this.currentNode;
                }
                this.currentNode = nodeResult.records[0].get('n');
            },
            async searchSubstance(e) {
                if (e.key == 'Enter' || e == 'Enter') {
                    if (this.query == '') {
                        this.$swal.fire('Enter substance code or name.');
                        return;
                    }

                    var substancesTypes = ['(n:Drug)', '(n:Indication)', '(n:SideEffect)'];
                    var foundSubstances = [] /* Values represeting [drugFound, indicationFound, sideeffectFound]*/
                    for (let i = 0; i < 3; i++) {
                        foundSubstances.push(await this.checkNodeExists(substancesTypes[i]));
                    }

                    /* This part is a little longer because some substances might be side effects as well as indications
                       and we want to let user pick which type of relationships they want to display. */
                    if (!foundSubstances[0] && !foundSubstances[1] && !foundSubstances[2]) {
                        this.$swal.fire('Invalid input, substance does not exist in the database');
                        return;
                    } else if (!foundSubstances[0] && foundSubstances[1] && foundSubstances[2]) {
                        var alertResult = await this.$swal.fire({
                            title: 'Searched substance is both indication and side effect. Which type of relationship do you want to display?',
                            showCancelButton: true,
                            showDenyButton: true,
                            confirmButtonText: 'Indication',
                            denyButtonText: 'Side effect',
                        })
                        if (alertResult.isConfirmed) {
                            foundSubstances[2] = false;
                        } else if (alertResult.isDenied) {
                            foundSubstances[1] = false;
                        } else {
                            return;
                        }
                    }

                    for (let i = 0; i < 3; i++) {
                        if (foundSubstances[i]) {
                            await this.fetchNodeResult(substancesTypes[i]);
                            await this.configureNeighbours();
                            return;
                        }
                    }
                }
            },
            draw() { 
                if (this.currentNode == null) {
                    this.$swal.fire('There is nothing to draw.');
                    return;
                }

                var config = {
                    container_id: 'viz-container',
                    server_url: this.protocol.concat('://'.concat(this.host.concat(':'.concat(this.port)))),
                    server_user: this.username,
                    server_password: this.password,
                    labels: {
                        "Drug": {
                            "caption": "name",
                        },
                        "SideEffect": {
                            "caption": "name",
                            "size": "score",
                            "font": {
                                "size": 18,
                            },
                            "title_properties": [
                                "name",
                                "code"
                            ],
                        },
                        "Indication": {
                            "caption": "name",
                            "size": "pageRankScore",
                            "font": {
                                "size": 18,
                            },
                            "title_properties": [
                                "name",
                                "code"
                            ],
                        }
                    },
                    relationships: {
                        "sideeffect": {
                            "thickness": "0.5",
                            "caption": false,
                        },
                        "indication": {
                            "thickness": "0.5",
                            "caption": false,
                        },
                    },
                    initial_cypher: this.findRelationCypher(),
                };

                this.viz = new NeoVis(config);
                this.viz.render();
                console.log(this.viz);
            },
            async swapToPrevious() {
                if (this.currentNode == null || this.previousNode == null) {
                    this.$swal.fire('Node is missing.');
                    return;
                }

                var temp = this.previousNode;
                this.previousNode = this.currentNode;
                this.currentNode = temp;
                await this.configureNeighbours();
            },
            async swapToNeighbour() {
                if (this.currentNode == null || this.selectedNeighbour == null) {
                    this.$swal.fire('Node is missing.');
                    return;
                }

                this.previousNode = this.currentNode;
                this.currentNode = this.selectedNeighbour;
                await this.configureNeighbours();
            },
            async checkForNeighbours() { 
                if (this.currentNode == null) {
                    return;
                }

                var relFlows = ['<-', '-', '->'];
                var relDiff = (this.currentNode.labels[0] == 'Drug') ? 1 : 0;

                const cypherCountQuery = 'MATCH (n:' + this.currentNode.labels[0] +
                    '{code:"' + this.currentNode.properties['code'] + '"})' +
                    relFlows[relDiff] + '[r]' + relFlows[relDiff+1] + '(m) RETURN count(r) AS count';

                const countRes = await this.$neo4j.run(cypherCountQuery);
                this.currentNeighCount = countRes.records[0].get('count');
            },
            async configureNeighbours() {
                this.currentNeighbours = [];
                this.currentNeighCount = 0;
                this.indicationCount = 0;
                await this.checkForNeighbours();
                if (this.currentNeighCount == 0) {
                    this.$swal.fire("Warning: this substance doesn't have any neighbours.");
                    return;
                }

                /* There are very few drugs that do not have any indications whilst having side effect neighbours,
                   so we check the indications count just in case one of these drugs is searched, because the relation cypher
                   must be adjusted, otherwise it won't work. This part would be desirable to generalize for all kinds of different
                   outputs in the future plans if we decide to elevate the prototype. */
                if (this.currentNode.labels[0] == 'Drug') {
                    const iCountQuery = 'MATCH (n:Drug{code:"' + this.currentNode.properties['code'] + '"})-[rel:indication]->(i) RETURN count(rel) AS count';
                    const iCountRes = await this.$neo4j.run(iCountQuery);
                    this.indicationCount = iCountRes.records[0].get('count');
                }

                const neighRes = await this.$neo4j.run(this.findRelationCypher());

                if (this.currentNode.labels[0] == 'Drug' && this.indicationCount != 0) {
                    for (let i = 0; i < this.indicationCount * this.indicationCount * this.nodeLimit; i += this.indicationCount * this.indicationCount) {
                        this.currentNeighbours.push(neighRes.records[i].get('s'));
                    }
                    for (let j = 0; j < ((this.indicationCount > ~~(this.nodeLimit / 2)) ? ~~(this.nodeLimit / 2) : this.indicationCount); j++) {
                        this.currentNeighbours.push(neighRes.records[j].get('i'));
                    }
                } else {
                    for (let i = 0; i < ((this.currentNeighCount < this.nodeLimit) ? this.currentNeighCount : this.nodeLimit); i++) {
                        this.currentNeighbours.push(neighRes.records[i].get('d'));
                    }
                }
            },
            findRelationCypher() {
                var cypherQuery = 'MATCH (n:' + this.currentNode.labels[0] + '{code:"' + this.currentNode.properties['code'] + '"})';
                if (this.currentNeighCount == 0) {
                    return cypherQuery + 'RETURN n';
                }

                switch (this.currentNode.labels[0]) {
                    case 'Drug':
                        if (this.indicationCount == 0) {
                            cypherQuery += '-[rel:sideeffect]->(:SideEffect) CALL {WITH n MATCH (n)-[:sideeffect]->(d) RETURN d ORDER BY d.score DESC LIMIT ' +
                                this.nodeLimit + '} RETURN n, d, rel'
                        } else {
                            cypherQuery += '-[rel:sideeffect]->(:SideEffect) CALL {WITH n MATCH (n)-[:sideeffect]->(s) RETURN s ORDER BY s.score DESC LIMIT ' +
                                this.nodeLimit + '} MATCH (n)-[rel2:indication]->(:Indication) CALL {WITH n MATCH (n)-[:indication]->(i) RETURN i ORDER BY i.score DESC LIMIT ' +
                                ~~(this.nodeLimit / 2) + '} RETURN n, s, i, rel, rel2';
                        }
                        break;
                    case 'SideEffect':
                        cypherQuery += '<-[rel:sideeffect]->(:Drug) CALL {WITH n MATCH(n)<-[:sideeffect]-(d) RETURN d LIMIT ' +
                            this.nodeLimit + '} RETURN n, d, rel';
                        break;
                    case 'Indication':
                        cypherQuery += '<-[rel:indication]->(:Drug) CALL {WITH n MATCH(n)<-[:indication]-(d) RETURN d LIMIT ' +
                            this.nodeLimit + '} RETURN n, d, rel';
                        break;
                }
                return cypherQuery;
            },
            formatNodeInfo(node) {
                if (node == null) {
                    return '';
                }
                return `Type: ${node.labels[0]} <br>Code: ${node.properties['code']} <br>Name: ${node.properties['name']}`;
            },
            showHelp() { 
                this.$swal.fire({html: helpText });
            }
        },
        beforeMount() {
            this.connectNeo4jDB();
        }
    };
</script>

<style>
    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }

    body {
        font-family: "montserrat", sans-serif;
    }

    main {
        min-height: 100vh;
        padding: 25px;
    }

    .main-menu {
        display: flex;
    }

    .search-box {
        display: block;
        width: 350px;
        height: 30px;
        margin-bottom: 30px;
        margin-right: 20px;
    }

    .input-bar {
        display: block;
        width: 100%;
        padding: 15px;
        font-size: 20px;
        background: none;
        border: none;
        outline: none;
        background-color: rgba(255, 255, 255, 0.75);
        border-radius: 10px 10px 10px 10px;
        box-shadow: 0px 0px 10px #6fb3b8;
    }

    .input-bar:focus {
        background-color: rgba(255, 255, 255, 0.95);
    }

    .limit-box {
        display: block;
        width: 60px;
        height: 30px;
        margin-bottom: 30px;
        margin-right: 20px;
    }

    .menu-button {
        width: 180px;
        height: 30px;
        margin-bottom: 30px;
        margin-right: 20px;
    }

    .menu-button .button-text {
        color: white;
    }

    .menu-button .button {
        display: block;
        width: 100%;
        padding: 15px;
        font-size: 20px;
        background: none;
        border: none;
        outline: none;
        background-color: #a6dac7;
        border-radius: 10px 10px 10px 10px;
        box-shadow: 0px 0px 10px #6fb3b8;
    }

    .menu-button .button:hover {
        background-color: #8bc6bf;
    }

    .information-box {
        width: 465px;
        height: 100%;
        background-color: #86C6CF;
        border-radius: 10px 10px 10px 10px;
        margin-top: 15px;
        box-shadow: 0px 0px 10px #6fb3b8;
        display: block;
        border: none;
        padding: 5px;
        outline: none;
        overflow: auto;
    }

    .information-box .node {
        color: white;
        font-size: 23px;
        font-weight: 400;
        margin-top: 10px;
        margin-left: 10px;
    }

    .information-box .desc {
        color: white;
        font-size: 18px;
        font-weight: 400;
        font-style: italic;
        margin-top: 5px;
        margin-left: 10px;
    }

    #viz-container {
        padding: 20px;
        display: block;
        width: 100%;
        height: 610px;
        margin-left: 20px;
        background-color: rgba(255, 255, 255, 0.75);
    }

    .result-menu {
        display: flex;
    }

    .result-menu-button {
        width: 200px;
        height: 30px;
        margin-top: 10px;
        margin-bottom: 30px;
        margin-left: 10px;
    }

    .result-menu-button .button-text {
        color: white;
    }

    .result-menu-button .button {
        display: block;
        width: 100%;
        padding: 15px;
        font-size: 18px;
        background: none;
        border: none;
        outline: none;
        background-color: #a6dac7;
        border-radius: 10px 10px 10px 10px;
        box-shadow: 0px 0px 10px #6fb3b8;
    }

    .result-menu-button .button:hover {
        background-color: #8bc6bf;
    }

    .selector {
        width: 300px;
        height: 30px;
        margin-top: 10px;
        margin-left: 10px;
        margin-right: 10px;
    }
</style>
