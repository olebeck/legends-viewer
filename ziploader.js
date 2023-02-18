import * as THREE from 'three'; 

export class ZipLoadingManager extends THREE.LoadingManager {
    constructor(zr) {
        super();
        this.zr = zr;
        this.setURLModifier((url) => {
            const e = this.entries.get(url);
            if(!e) return `${url} not found`;
            return e;
        });
    }

    async Load(cb) {
        if(!this.entries) {
            const entries = await this.zr.getEntries();
            this.entries = new Map();
            for(const entry of entries) {
                let mime = "";
                switch(entry.filename.split(".")[1]) {
                case "png":
                    mime = "image/png";
                    break;
                }
                const url = URL.createObjectURL(await entry.getData(new zip.BlobWriter(mime)));
                this.entries.set(entry.filename, url);
            }
        }
        cb();
    }
}
