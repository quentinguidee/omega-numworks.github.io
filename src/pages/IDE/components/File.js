
import React, { Component } from 'react';

export default class File extends Component {
    constructor(props) {
        super(props);

        this.state = {
            "name": props.name,
            "oldName": "",
            
            "isRenaming": false,
            
        };

        this.handleChange   = this.handleChange.bind(this);
        this.handleRename   = this.handleRename.bind(this);
        this.handleRemove   = this.handleRemove.bind(this);
        this.handleClick    = this.handleClick.bind(this);
        this.handleValidate = this.handleValidate.bind(this);
        this.handleCancel   = this.handleCancel.bind(this);
        this.handleKeyDown  = this.handleKeyDown.bind(this);
        this.stopBubble     = this.stopBubble.bind(this);
    }

    handleChange(event) {
        if (this.state.isRenaming) {
            this.setState({name: event.target.value});
        }
    }

    handleRename(event) {
        this.stopBubble(event);
        this.setState({isRenaming: true, oldName: this.state.name});
    }

    handleRemove(event) {
        this.stopBubble(event);
        if (this.props.onRemove)
            this.props.onRemove(this.props.userdata);
    }

    handleClick(event) {
        this.stopBubble(event);
        if (this.props.onClick && !this.state.isRenaming)
            this.props.onClick(this.props.userdata);
    }

    handleValidate(event) {
        this.stopBubble(event);
        if (this.state.isRenaming) {
            if (this.props.onRename)
                this.props.onRename(this.props.userdata, this.state.oldName, this.state.name);
            this.setState({isRenaming: false});
        }
    }

    handleCancel(event) {
        this.stopBubble(event);
        if (this.state.isRenaming) {
            this.setState({isRenaming: false, name: this.state.oldName});
        }
    }

    handleKeyDown(event) {
        if (event.key === 'Enter') {
            this.handleValidate(event);
        }
        if (event.key === 'Escape') {
            this.handleCancel(event);
        }
    }

    stopBubble(event) {
        event.stopPropagation();
    }

    render() {
        return (
            <li onClick={this.handleClick} className={"editor__leftmenu__dropdown__content__element" + (this.state.isRenaming ? " editor__leftmenu__dropdown__content__element-rename" : "")}>
                <i className="editor__leftmenu__dropdown__content__element__icon material-icons">insert_drive_file</i>
                <span className="editor__leftmenu__dropdown__content__element__name">{this.state.name}</span>
                <input onClick={this.stopBubble} onKeyDown={this.handleKeyDown} value={this.state.name} onChange={this.handleChange} type="text" className="editor__leftmenu__dropdown__content__element__input"/>
                <div className="editor__leftmenu__dropdown__content__element__actions editor__leftmenu__dropdown__content__element__actions__normal">
                    <i onClick={this.handleRename} className="editor__leftmenu__dropdown__content__element__actions__icon material-icons">create</i>
                    <i onClick={this.handleRemove} className="editor__leftmenu__dropdown__content__element__actions__icon material-icons">delete</i>
                </div>
                <div className="editor__leftmenu__dropdown__content__element__actions editor__leftmenu__dropdown__content__element__actions__rename">
                    <i onClick={this.handleValidate} className="editor__leftmenu__dropdown__content__element__actions__icon material-icons">done</i>
                    <i onClick={this.handleCancel} className="editor__leftmenu__dropdown__content__element__actions__icon material-icons">clear</i>
                </div>
                <div onClick={this.handleCancel} className="editor__leftmenu__dropdown__content__element__renamediv"></div>
            </li>
        );
    }
}
