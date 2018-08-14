const mongoose = require('mongoose');
const Store = mongoose.model('Store');
const multer = require('multer');
const jimp = require('jimp');
const uuid = require('uuid');
const User = mongoose.model('User');

const multerOptions = {
    storage: multer.memoryStorage(),
    fileFilter: (req, file, next) => {
        const isPhoto = file.mimetype.startsWith('image/');
        if(isPhoto) {
            next(null, true);
        } else {
            next({message: 'that filetype isn\'t allowed'}, false);
        }
    }
};

exports.addStore = (req, res) => {
    res.render('editStore', {title: 'Add Store'});
}

exports.upload = multer(multerOptions).single('photo');

exports.resize = async (req, res, next) => {
    // check if there is no new file to size
    if(!req.file) {
        next(); // skip to next middleware
    }
    const extension = req.file.mimetype.split('/')[1];
    req.body.photo = `t-${uuid.v4()}.${extension}`;
    // resize
    const photo = await jimp.read(req.file.buffer);
    await photo.resize(800, jimp.AUTO);
    await photo.write(`./public/uploads/${req.body.photo}`);
    // once we have written the photo to the file system, keep going!
    next();
}


exports.createStore = async (req, res) => {
    req.body.author = req.user._id;
    const store = await (new Store(req.body)).save();
    req.flash('success', `Successfully Created ${store.name}. Care to leave a review`);
    res.redirect(`/store/${store.slug}`);
}

exports.getStores = async (req, res) => {
    const page = req.params.page || 1;
    const limit = 4;
    const skip = (page * limit) - limit;
    // 1. query the database for a list of all stores
    const storesPromise = Store
        .find()
        .skip(skip)
        .limit(limit)
        .sort({created: 'desc'});

    const countPromise = Store.count();
    const [ stores, count ] = await Promise.all([storesPromise, countPromise]);
    const pages = Math.ceil(count / limit);
    if(!stores.length && skip) {
        req.flash('info', `Hey! you asked for page ${page}. But that doesn't exist. So I put you on page ${pages}`);
        res.redirect(`/stores/page/${pages}`);
        return
    }
    res.render('stores', {title: 'Stores', stores, count, page, pages });
}

exports.getStoreBySlug = async (req, res, next) => {
    const store = await Store.findOne({slug: req.params.slug}).populate('author reviews');
    // console.log(store)
    if(!store) return next();
    // res.json(store)
    res.render('store', { title: store.name, store});
}

const confirmOwner = (store, user) => {
    if(!store.author.equals(user._id)) {
        throw Error('You must own a store in order to edit it')
    }
}

exports.editStore = async (req, res) => {
    // find the store given id 
    const store = await Store.findOne({ _id: req.params.id });
    // confirm they are the owner of the store
    confirmOwner(store, req.user);
    // render out the edit form so the user can update
    res.render('editStore', { title: `Edit store ${store.name}`, store})
}

exports.updateStore = async (req, res) => {

    // 
    req.body.location.type = 'Point';

    // find and update the store
    const store = await Store.findOneAndUpdate({ _id: req.params.id }, req.body, {
        new: true, // return new store instead of the old one
        runValidators: true
    }).exec();

    req.flash('success', `Successfully updated ${store.name}. <a href="/stores/${store.slug}">View Store</a> ->`);
    res.redirect(`/stores/${store._id}/edit`);
    // redirect them to the store
}

exports.getStoresByTag = async (req, res) => {
    const tag = req.params.tag;
    const tagQuery = tag || { $exists: true };
    const tagsPromise = Store.getTagsList();
    const storesPromise = Store.find({ tags: tagQuery });
    const [tags, stores] = await Promise.all([tagsPromise, storesPromise]);

    // res.json([tags, stores]);
    res.render('tag', {tags, stores, title: 'Tags', tag});
}

exports.searchStores = async (req, res) => {
    const stores = await Store.find({
        $text: { 
            $search: req.query.q
        }
    },{
        score: { $meta: 'textScore' }
    }).sort({
        score: { $meta: 'textScore' }
    }).limit(5);
    res.json(stores);    
}

exports.mapStores = async (req, res) => {
    const coordinates = [req.query.lng, req.query.lat].map(parseFloat);
    const q = {
        location: {
            $near: {
                $geometry: {
                    type: 'Point',
                    coordinates
                },
                $maxDistance: 10000
            }
        }
    };
    const stores = await Store.find(q).select('slug name description location photo').limit(10);
    res.json(stores);
}

exports.mapPage = (req, res) => {
    res.render('map', { title: 'Map'});
}

exports.heartStore = async (req, res) => {
    const hearts = req.user.hearts.map(obj => obj.toString());
    const operator = hearts.includes(req.params.id) ? '$pull' : '$addToSet';
    const user = await User
    .findByIdAndUpdate(
        req.user._id, 
        { [operator]: { hearts: req.params.id } },
        { new: true } 
    );
    res.json(user)
}

exports.getHearts = async (req, res) => {
    const stores = await Store.find({
        _id: { $in: req.user.hearts }
    });
    res.render('stores', { title: 'Hearted Stores', stores });
};

exports.getTopStores = async (req, res) => {
    const stores = await Store.getTopStores();
    res.render('topStores', { stores, title: '★ Top Stores!'});
    // res.json(stores)
}