import Vue from 'vue'
import App from './App.vue'
import VueNeo4j from 'vue-neo4j'
import VueSweetalert2 from 'vue-sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

Vue.config.productionTip = false

const options = {
    confirmButtonColor: '#86C6CF',
    denyButtonColor: '#86C6CF',
};

Vue.use(VueNeo4j)
Vue.use(VueSweetalert2, options);

new Vue({
  render: h => h(App),
}).$mount('#app')
