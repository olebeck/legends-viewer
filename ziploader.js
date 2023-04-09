import * as THREE from 'three'; 

export class ZipLoadingManager extends THREE.LoadingManager {
    constructor(zr) {
        super();
        this.zr = zr;
        this.setURLModifier((url) => {
            if(!this.entries.has(url)) {
                return `${url} not found`;
            }
            return this.entries.get(url);
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
