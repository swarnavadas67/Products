
const cds = require('@sap/cds');
module.exports = cds.service.impl(async function(){
    const { Products } = this.entities;

    const NorthwindSrv = await cds.connect.to('Northwind');

    this.on('READ', Products, async (req) => {
        
        // const tx = cds.tx(req.query);
        return NorthwindSrv.run(req.query);
    }); 
})